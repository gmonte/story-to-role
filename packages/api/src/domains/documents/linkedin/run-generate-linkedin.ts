import { randomUUID } from "node:crypto";

import { KeyUnusableError } from "@repo/api/domains/ai/providers/provider-package";
import type { AiClient } from "@repo/api/domains/ai/ai-client";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadSensitiveFilter } from "@repo/api/domains/evidence/sensitive/load-sensitive-filter";
import type { TaskProgress } from "@repo/api/domains/tasks/schemas/task";
import type { DbClient } from "@repo/api/tools/db-client";
import { logger } from "@repo/common/tools/logger";

import type { CoverageReviewContent } from "../coverage-review/coverage-review";
import { reviewCoverage } from "../coverage-review/run-coverage-review";
import { DocumentsRepository } from "../documents-repository";
import {
  assembleResume,
  type AssemblyDraft,
} from "../generation/assemble-resume";
import { loadCareerContext } from "../generation/load-career-context";
import { purposesOf, resumeMaterial } from "../generation/resume-prompts";
import { reviewLoopSettings } from "../generation/review-loop-settings";
import {
  findForbiddenLines,
  lockedFactViolations,
} from "../generation/resume-checks";
import {
  defaultGenerationSettings,
  generationSettingsSchema,
} from "../schemas/generation-settings";
import type { LinkedinContent } from "../schemas/linkedin-content";
import { loadWritingSetup } from "../writing/load-writing-setup";
import { linkedinAsResume } from "./linkedin-resume";
import {
  careerFocus,
  type LinkedinDraft,
  linkedinDraftSchema,
  linkedinPrompt,
  linkedinPurposeLines,
} from "./linkedin-prompts";

/**
 * Assembles LinkedIn content from a draft by the resume's own rules
 * (`assembleResume`): locked facts printed by code, each line citing
 * profile lines, figures only where the profile marks them measured, the
 * communication rules, studied and never-claim terms refused, bullets per
 * the settings by age and the very old rule. LinkedIn has no requirement
 * to justify a very old experience, so under “relevant only” it is left
 * out. Positions with no line left are not printed.
 */
export function assembleLinkedin(input: {
  draft: LinkedinDraft;
  context: Parameters<typeof assembleResume>[0]["context"];
  settings: Parameters<typeof assembleResume>[0]["settings"];
  today: string;
  newLineId?: () => string;
}) {
  const { draft } = input;
  const about = draft.about.paragraphs
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join("\n\n");
  const assemblyDraft: AssemblyDraft = {
    emphasis: [],
    title_line: "",
    summary: about
      ? { text: about, evidence_ids: draft.about.evidence_ids }
      : null,
    skills: [],
    experience: draft.experience.map((entry) => ({
      position_id: entry.position_id,
      context: null,
      relevance: null,
      bullets: entry.bullets,
    })),
    projects: [],
  };
  const newLineId = input.newLineId ?? (() => randomUUID().slice(0, 8));
  const { content, dropped } = assembleResume({
    draft: assemblyDraft,
    context: input.context,
    sections: ["summary", "experience"],
    settings: input.settings,
    today: input.today,
    purposes: [],
    targetTitle: null,
    newLineId,
  });
  const summary = content.sections.find(
    (section) => section.kind === "summary"
  );
  const experience = content.sections.find(
    (section) => section.kind === "experience"
  );
  const linkedin: LinkedinContent = {
    kind: "linkedin",
    about:
      summary?.kind === "summary"
        ? summary.line
        : { id: newLineId(), text: "", origin: { kind: "manual" } },
    experiences:
      experience?.kind === "experience"
        ? experience.entries
            .filter((entry) => entry.lines.length > 0)
            .map((entry) => ({
              positionId: entry.positionId,
              employer: entry.employer,
              title: entry.title,
              startDate: entry.startDate,
              endDate: entry.endDate,
              lines: entry.lines,
            }))
        : [],
  };
  return { content: linkedin, dropped };
}

const withoutLines = (
  content: LinkedinContent,
  lineIds: string[]
): LinkedinContent => ({
  ...content,
  about: lineIds.includes(content.about.id)
    ? { ...content.about, text: "" }
    : content.about,
  experiences: content.experiences.map((entry) => ({
    ...entry,
    lines: entry.lines.filter((line) => !lineIds.includes(line.id)),
  })),
});

/**
 * Generates the user's LinkedIn text from the profile version the
 * generation froze (resume spec, "LinkedIn"): one writer call, code
 * assembling its draft by the resume's rules, then the coverage review
 * once, against the career as the profile states it. Stored as a snapshot
 * like any document's, with the review.
 */
export async function runGenerateLinkedin(deps: {
  db: DbClient;
  ai: AiClient;
  cipher: UserCipher;
  userId: string;
  generationId: string;
  reportProgress?: (progress: TaskProgress) => Promise<void>;
  today?: string;
}) {
  const { db, ai, cipher } = deps;
  const documents = new DocumentsRepository(db);
  const generation = await documents.findGeneration(deps.generationId);
  if (!generation) throw new Error(`Generation ${deps.generationId} not found`);
  const profile = await new CareerRepository(db).findProfileById(
    generation.profileId
  );
  if (profile?.userId !== deps.userId) {
    throw new Error(`Generation ${generation.id} belongs to another user`);
  }
  const document = await documents.findDocument(generation.documentId);
  if (document?.kind !== "linkedin") {
    throw new Error(`Generation ${generation.id} is not for a LinkedIn text`);
  }
  await documents.updateGeneration(generation.id, { status: "running" });
  let stoppedBy: KeyUnusableError | null = null;
  try {
    const settings = generationSettingsSchema
      .catch(defaultGenerationSettings)
      .parse(generation.settings ?? defaultGenerationSettings);
    const today = deps.today ?? new Date().toISOString().slice(0, 7);
    const filter = await loadSensitiveFilter({
      db,
      cipher,
      profileId: generation.profileId,
      profileVersionId: generation.profileVersionId,
    });
    const context = await loadCareerContext({
      db,
      cipher,
      profileId: generation.profileId,
      filter,
      profileVersionId: generation.profileVersionId,
      language: generation.language,
    });
    if (!context.profileVersionId) {
      throw new Error(`Generation ${generation.id} has no published profile`);
    }
    const brief = {
      title: careerFocus,
      company: null,
      terms: [],
      fitCheck: [],
      focus: careerFocus,
    };
    const setup = await loadWritingSetup({ db, cipher, userId: deps.userId });
    const material = resumeMaterial({
      context,
      opening: brief,
      sections: [],
      language: generation.language,
      tone: generation.tone,
      style: setup.style,
      settings,
      today,
      purposeLines: linkedinPurposeLines,
    });
    const role = generation.writingLevel === "maximum" ? "maximum" : "writing";
    const progress = (step: number, label: string) =>
      deps.reportProgress?.({ step, totalSteps: 3, label });

    await progress(1, "drafting");
    const written = await ai.generateObject({
      purpose: "linkedin_writer",
      role,
      maxTokens: reviewLoopSettings.draftMaxTokens,
      schema: linkedinDraftSchema,
      system: linkedinPrompt(material, settings),
      messages: [{ role: "user", content: "Write the LinkedIn text." }],
    });
    if (!written.object) throw new Error("The writer returned no draft");
    const assembled = assembleLinkedin({
      draft: written.object,
      context,
      settings,
      today,
    });
    // Code has the last word: lines with a forbidden term go.
    const forbidden = findForbiddenLines(
      linkedinAsResume(assembled.content),
      filter
    );
    const content = withoutLines(assembled.content, forbidden);
    if (
      lockedFactViolations(linkedinAsResume(content), context.positions)
        .length > 0
    ) {
      throw new Error(`Generation ${generation.id} altered a locked fact`);
    }

    // The coverage review never costs the document: without one it is
    // saved, and the code checks still run on it.
    let coverage: CoverageReviewContent | null = null;
    await progress(2, "coverage_review");
    try {
      coverage = await reviewCoverage({
        ai,
        content: linkedinAsResume(content),
        context,
        brief,
        purposes: purposesOf(brief),
        language: generation.language,
        documentName: "LinkedIn text",
      });
    } catch (error) {
      if (error instanceof KeyUnusableError) {
        stoppedBy = error;
      } else {
        logger.warn(["documents"], "Coverage review failed", {
          generationId: generation.id,
          error: error instanceof Error ? error.name : "unknown",
        });
      }
    }

    await progress(3, "saving");
    await db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const existing = generation.versionId
        ? await repository.findVersion(generation.versionId)
        : null;
      const version =
        existing ??
        (await repository.insertVersion({
          documentId: document.id,
          language: generation.language,
        }));
      await repository.lockVersion(version.id);
      const latest = await repository.latestSnapshot(version.id);
      const snapshot = await repository.insertSnapshot({
        versionId: version.id,
        sequence: (latest?.sequence ?? 0) + 1,
        parentSnapshotId: latest?.id ?? null,
        origin: "generated",
        author: "ai",
        encryptedContent: cipher.encrypt(JSON.stringify(content)),
        generationId: generation.id,
        profileVersionId: context.profileVersionId,
      });
      if (coverage) {
        await repository.insertCoverageReview({
          generationId: generation.id,
          snapshotId: snapshot.id,
          profileVersionId: context.profileVersionId,
          encryptedContent: cipher.encrypt(JSON.stringify(coverage)),
        });
      }
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
  if (stoppedBy) throw stoppedBy;
}
