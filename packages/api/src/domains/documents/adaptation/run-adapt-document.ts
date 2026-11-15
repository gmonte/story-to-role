import { z } from "zod";

import type { AiClient } from "@repo/api/domains/ai/ai-client";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { SensitiveFilter } from "@repo/api/domains/evidence/sensitive/sensitive-filter";
import type { TaskProgress } from "@repo/api/domains/tasks/schemas/task";
import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "../documents-repository";
import { generationSettings } from "../generation/generation-settings";
import { loadCareerContext } from "../generation/load-career-context";
import { outputLanguageNames } from "../generation/resume-prompts";
import {
  findForbiddenLines,
  lockedFactViolations,
  resumeLines,
} from "../generation/resume-checks";
import type { OutputLanguage } from "../schemas/document";
import {
  type ResumeContent,
  resumeContentSchema,
} from "../schemas/resume-content";
import {
  type AdaptationDraft,
  adaptationDraftSchema,
  adaptContent,
} from "./adapt-content";
import { keepsFigures } from "./figures";
import {
  acceptedTitles,
  loadTitleEquivalents,
  titlesForAdaptation,
} from "./title-equivalents";
import { mergeSync, type SyncChange } from "./three-way-merge";

/** The changes the user selected for a sync, stored with its generation. */
export const syncPlanSchema = z.object({
  changes: z.array(
    z.object({
      lineId: z.string(),
      kind: z.enum(["changed", "added", "removed"]),
      before: z.string().nullable(),
      after: z.string().nullable(),
      targetText: z.string().nullable(),
      conflict: z.boolean(),
    })
  ),
});

const syncDraftSchema = z.object({
  items: z.array(z.object({ id: z.string(), text: z.string() })),
});

const adaptationRules = [
  "Rules, enforced by code after you answer:",
  "- Rewrite each item for a native reader of the target language and market: idiomatic action verbs and the market's conventions. Rework phrasing that does not work in the target language instead of translating word for word.",
  "- Same facts only: add nothing, drop no fact, and never convert figures (no currency conversion, no rounding). An item with a figure its source lacks is rejected.",
  "- Keep each item's id. Never write employers or dates. Company and product names are never translated.",
].join("\n");

/**
 * Adapts a version into another output language, or carries a sync's
 * selected changes into its target (resume spec, "Adaptations" and
 * "Language sync"). The model rewrites wording only; code keeps every
 * line's id and evidence, refuses new figures, forbidden terms and changed
 * locked facts. An adaptation becomes a snapshot; a sync becomes a
 * proposal the user reviews.
 */
export async function runAdaptDocument(deps: {
  db: DbClient;
  ai: AiClient;
  cipher: UserCipher;
  filter: SensitiveFilter;
  userId: string;
  generationId: string;
  reportProgress?: (progress: TaskProgress) => Promise<void>;
}) {
  const { db, cipher } = deps;
  const documents = new DocumentsRepository(db);
  const generation = await documents.findGeneration(deps.generationId);
  if (!generation) throw new Error(`Generation ${deps.generationId} not found`);
  const profile = await new CareerRepository(db).findProfileById(
    generation.profileId
  );
  if (profile?.userId !== deps.userId) {
    throw new Error(`Generation ${generation.id} belongs to another user`);
  }
  const open = async (snapshotId: string | null) => {
    const snapshot = snapshotId && (await documents.findSnapshot(snapshotId));
    if (!snapshot) throw new Error(`Snapshot ${snapshotId} is gone`);
    return resumeContentSchema.parse(
      JSON.parse(cipher.decrypt(snapshot.encryptedContent))
    );
  };

  await documents.updateGeneration(generation.id, { status: "running" });
  try {
    const source = await open(generation.sourceSnapshotId);
    await deps.reportProgress?.({ step: 1, totalSteps: 2, label: "adapting" });
    if (generation.kind === "sync") {
      const target = await open(generation.targetSnapshotId);
      const plan = syncPlanSchema.parse(
        JSON.parse(cipher.decrypt(generation.encryptedSyncPlan ?? ""))
      );
      const proposal = await adaptChanges({
        ...deps,
        language: generation.language,
        source,
        target,
        changes: plan.changes,
      });
      await deps.reportProgress?.({ step: 2, totalSteps: 2, label: "saving" });
      await documents.updateGeneration(generation.id, {
        status: "proposed",
        encryptedProposal: cipher.encrypt(JSON.stringify(proposal)),
        finishedAt: new Date(),
      });
      return;
    }

    const content = await adaptVersion({
      ...deps,
      profileId: profile.id,
      generation,
      source,
    });
    await deps.reportProgress?.({ step: 2, totalSteps: 2, label: "saving" });
    await db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const sourceSnapshot = await repository.findSnapshot(
        generation.sourceSnapshotId!
      );
      const existing = generation.versionId
        ? await repository.findVersion(generation.versionId)
        : null;
      const version =
        existing ??
        (await repository.insertVersion({
          documentId: generation.documentId,
          language: generation.language,
        }));
      // Recreating lands on top; earlier snapshots stay in history.
      await repository.lockVersion(version.id);
      const latest = await repository.latestSnapshot(version.id);
      const snapshot = await repository.insertSnapshot({
        versionId: version.id,
        sequence: (latest?.sequence ?? 0) + 1,
        parentSnapshotId: latest?.id ?? null,
        origin: "adapted",
        author: "ai",
        encryptedContent: cipher.encrypt(JSON.stringify(content)),
        generationId: generation.id,
      });
      await repository.updateVersion(version.id, {
        adaptedFromVersionId: generation.sourceVersionId,
        syncBaseSnapshotId: sourceSnapshot?.id ?? null,
        syncBaseSequence: sourceSnapshot?.sequence ?? null,
        syncTargetSnapshotId: snapshot.id,
        syncTargetSequence: snapshot.sequence,
      });
      await repository.updateGeneration(generation.id, {
        status: "completed",
        versionId: version.id,
        snapshotId: snapshot.id,
        finishedAt: new Date(),
      });
    });
  } catch (error) {
    await documents.updateGeneration(generation.id, {
      status: "failed",
      finishedAt: new Date(),
    });
    throw error;
  }
}

async function adaptVersion(input: {
  db: DbClient;
  ai: AiClient;
  cipher: UserCipher;
  filter: SensitiveFilter;
  profileId: string;
  generation: { id: string; language: OutputLanguage; documentId: string };
  source: ResumeContent;
}) {
  const { db, cipher, filter, source, generation } = input;
  const documents = new DocumentsRepository(db);
  const document = await documents.findDocument(generation.documentId);
  const application = document?.applicationId
    ? await documents.findApplication(document.applicationId)
    : null;
  const context = await loadCareerContext({
    db,
    cipher,
    profileId: input.profileId,
    filter,
    openingId: application?.openingId,
  });
  const equivalents = await loadTitleEquivalents({
    db,
    cipher,
    profileId: input.profileId,
    filter,
  });
  const originals = new Map(
    (await new CareerRepository(db).listPositions(input.profileId)).map(
      (position) => [
        position.id,
        filter.apply(cipher.decrypt(position.encryptedTitle)),
      ]
    )
  );
  const entries = source.sections.flatMap((section) =>
    section.kind === "experience" ? section.entries : []
  );
  const lacking = entries.filter(
    (entry) =>
      !equivalents.some(
        (row) =>
          row.positionId === entry.positionId &&
          row.language === generation.language &&
          row.approved
      )
  );
  const labels = new Map(
    source.sections.flatMap((section) =>
      section.kind === "skills"
        ? section.groups.map((group): [string, string] => [
            group.id,
            group.label,
          ])
        : []
    )
  );
  const items = resumeLines(source).map((line) => ({
    id: line.id,
    text: line.text,
    label: labels.get(line.id) ?? null,
  }));
  const material = [
    `Target language: ${outputLanguageNames[generation.language]}.`,
    adaptationRules,
    "- title_equivalents: for each position listed under “Titles to propose”, the usual equivalent of its title in the target language (or the same title when it already reads naturally there).",
    "",
    "The resume to adapt (JSON):",
    JSON.stringify({
      title_line: source.header.titleLine,
      items,
      contexts: entries
        .filter((entry) => entry.context)
        .map((entry) => ({
          position_id: entry.positionId,
          context: entry.context,
        })),
    }),
    "",
    "Titles to propose:",
    // The position's own title: an override is this application's only.
    ...lacking.map(
      (entry) =>
        `- position ${entry.positionId}: ${originals.get(entry.positionId) ?? entry.title} at ${entry.employer}`
    ),
  ].join("\n");

  const ask = async (extra: string[]) => {
    const { object } = await input.ai.generateObject({
      purpose: "resume_adaptation",
      role: "writing",
      maxTokens: generationSettings.draftMaxTokens,
      schema: adaptationDraftSchema,
      system: [...extra, material].join("\n"),
      messages: [{ role: "user", content: "Adapt the resume." }],
    });
    if (!object) throw new Error("The adaptation returned nothing");
    return object;
  };

  const titles = titlesForAdaptation({
    source,
    language: generation.language,
    equivalents,
    originals,
  });
  let draft: AdaptationDraft = await ask([]);
  let result = adaptContent({ source, draft, titles });
  if (result.refused.length > 0) {
    // One more try for the refused lines, then their source wording stays.
    const retry = await ask([
      `These items brought figures their source does not have; rewrite them keeping exactly the source's figures: ${result.refused.join(", ")}.`,
    ]);
    const again = new Map(retry.items.map((item) => [item.id, item]));
    draft = {
      ...draft,
      items: draft.items.map((item) =>
        result.refused.includes(item.id) ? (again.get(item.id) ?? item) : item
      ),
    };
    result = adaptContent({ source, draft, titles });
  }
  // A line carrying a forbidden term keeps its source wording, which passed.
  const forbidden = new Set(findForbiddenLines(result.content, filter));
  const content =
    forbidden.size > 0
      ? adaptContent({
          source,
          draft: {
            ...draft,
            title_line: forbidden.has("title_line")
              ? source.header.titleLine
              : draft.title_line,
            items: draft.items.filter((item) => !forbidden.has(item.id)),
            contexts: draft.contexts.filter(
              (row) => !forbidden.has(`context:${row.position_id}`)
            ),
          },
          titles,
        }).content
      : result.content;

  const proposed = new Map(
    draft.title_equivalents.map((row) => [row.position_id, row.title.trim()])
  );
  for (const entry of lacking) {
    const title = proposed.get(entry.positionId);
    if (!title || filter.findForbiddenTerms(title).length > 0) continue;
    await documents.proposeTitleEquivalent({
      profileId: input.profileId,
      positionId: entry.positionId,
      language: generation.language,
      encryptedTitle: cipher.encrypt(title),
    });
  }

  if (
    lockedFactViolations(
      content,
      context.positions,
      acceptedTitles(equivalents, generation.language)
    ).length > 0
  ) {
    throw new Error(`Adaptation ${generation.id} altered a locked fact`);
  }
  return content;
}

/** One call adapts the selected changes; code merges them into the target. */
async function adaptChanges(input: {
  ai: AiClient;
  filter: SensitiveFilter;
  language: OutputLanguage;
  source: ResumeContent;
  target: ResumeContent;
  changes: SyncChange[];
}) {
  const worded = input.changes.filter((change) => change.after !== null);
  const adapted = new Map<string, string>();
  if (worded.length > 0) {
    const { object } = await input.ai.generateObject({
      purpose: "language_sync",
      role: "writing",
      maxTokens: generationSettings.draftMaxTokens,
      schema: syncDraftSchema,
      system: [
        `Carry these changed lines of a resume into its version in ${outputLanguageNames[input.language]}. Each item has the new wording in the source language and, when it has one, the target's current wording, whose style you keep.`,
        adaptationRules,
        "",
        JSON.stringify(
          worded.map((change) => ({
            id: change.lineId,
            text: change.after,
            current: change.targetText,
          }))
        ),
      ].join("\n"),
      messages: [{ role: "user", content: "Adapt the changes." }],
    });
    for (const item of object?.items ?? []) {
      const change = worded.find((row) => row.lineId === item.id);
      const text = item.text.trim();
      if (
        change?.after &&
        text &&
        keepsFigures(change.after, text) &&
        input.filter.findForbiddenTerms(text).length === 0
      ) {
        adapted.set(item.id, text);
      }
    }
  }
  return mergeSync({
    source: input.source,
    target: input.target,
    changes: input.changes,
    adapted,
  });
}
