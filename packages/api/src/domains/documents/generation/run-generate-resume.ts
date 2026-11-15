import { z } from "zod";

import type { AiClient } from "@repo/api/domains/ai/ai-client";
import type { AiUsage } from "@repo/api/domains/ai/providers/provider-package";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { SensitiveFilter } from "@repo/api/domains/evidence/sensitive/sensitive-filter";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { TaskProgress } from "@repo/api/domains/tasks/schemas/task";
import type { DbClient } from "@repo/api/tools/db-client";
import type { Storage } from "@repo/api/tools/storage/storage";

import { decryptResume } from "../snapshot-content";
import { DocumentsRepository } from "../documents-repository";
import { fitToPages } from "../rendering/fit-to-pages";
import { storeRenderedPdf } from "../rendering/store-rendered-pdf";
import type { ResumeContent, ResumeSection } from "../schemas/resume-content";
import { loadWritingSetup } from "../writing/load-writing-setup";
import { resolveSections } from "../template/resolve-sections";
import {
  assembleResume,
  type DroppedLine,
  type ResumeDraft,
  resumeDraftSchema,
} from "./assemble-resume";
import { generationSettings } from "./generation-settings";
import { loadCareerContext } from "./load-career-context";
import {
  editorPrompt,
  type OpeningBrief,
  resumeMaterial,
  reviewerPrompt,
  strategistPrompt,
} from "./resume-prompts";
import {
  estimatePages,
  findForbiddenLines,
  lockedFactViolations,
  maxResumePages,
  resumeLines,
} from "./resume-checks";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(10),
  gaps: z.array(z.string()).max(8),
});

type Candidate = {
  round: number;
  draft: ResumeDraft;
  content: ResumeContent;
  dropped: DroppedLine[];
  forbidden: string[];
  pages: number;
  rating: number;
  gaps: string[];
  inputTokens: number;
  outputTokens: number;
};

const tokens = (usages: AiUsage[]) => ({
  inputTokens: usages.reduce((sum, u) => sum + u.inputTokens, 0),
  outputTokens: usages.reduce((sum, u) => sum + u.outputTokens, 0),
});

/**
 * Generates a resume for an opening (resume spec, "Review rounds"): the
 * strategist drafts, then each review round has a reviewer rate the draft
 * against the opening and an editor apply the review. Quick allows one
 * round, Thorough more, stopping early at the target rating or when the
 * rating stops improving. Code checks every draft (evidence, figures,
 * skills, locked facts, forbidden terms, length); the best-rated draft
 * becomes the version's new snapshot, and every round is stored.
 */
export async function runGenerateResume(deps: {
  db: DbClient;
  ai: AiClient;
  cipher: UserCipher;
  filter: SensitiveFilter;
  userId: string;
  generationId: string;
  reportProgress?: (progress: TaskProgress) => Promise<void>;
  /** Where the final PDF is kept; without it, it is only measured. */
  storage?: Storage;
}) {
  const { db, ai, cipher, filter } = deps;
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
  const application = document?.applicationId
    ? await documents.findApplication(document.applicationId)
    : null;
  // A library document has its focus where an application has its opening.
  const focus = document?.encryptedFocus
    ? cipher.decrypt(document.encryptedFocus)
    : null;
  if (!document || (!application && !focus)) {
    throw new Error(`Generation ${generation.id} has no application or focus`);
  }

  await documents.updateGeneration(generation.id, { status: "running" });
  try {
    const brief: OpeningBrief = application
      ? await loadOpeningBrief({ db, cipher, openingId: application.openingId })
      : { title: focus, company: null, terms: [], fitCheck: [], focus };
    const reference = generation.referenceSnapshotId
      ? await documents.findSnapshot(generation.referenceSnapshotId)
      : null;
    const setup = await loadWritingSetup({ db, cipher, userId: deps.userId });
    const context = await loadCareerContext({
      db,
      cipher,
      profileId: generation.profileId,
      filter,
      openingId: application?.openingId,
      language: generation.language,
    });
    const sections = resolveSections({
      template: setup.templateSections,
      language: generation.language,
      topics: [brief.title ?? "", ...brief.terms.map((term) => term.text)],
      forcedIn: application?.sectionsForcedIn ?? [],
      forcedOut: application?.sectionsForcedOut ?? [],
    });
    const material = resumeMaterial({
      context,
      opening: brief,
      sections,
      language: generation.language,
      tone: generation.tone,
      style: setup.style,
      reference: reference && decryptResume(cipher, reference),
    });
    const role = generation.writingLevel === "maximum" ? "maximum" : "writing";
    const totalRounds = generationSettings.reviewRounds[generation.reviewDepth];
    const progress = (step: number, label: string) =>
      deps.reportProgress?.({ step, totalSteps: totalRounds + 2, label });

    const evaluate = (draft: ResumeDraft) => {
      const { content, dropped } = assembleResume({
        draft,
        context,
        sections,
        header: setup.header,
      });
      return {
        draft,
        content,
        dropped,
        forbidden: findForbiddenLines(content, filter),
        pages: estimatePages(content),
      };
    };

    const review = async (
      evaluated: ReturnType<typeof evaluate>,
      round: number,
      usages: AiUsage[]
    ): Promise<Candidate> => {
      const { object, usage } = await ai.generateObject({
        purpose: "resume_review",
        role: "writing",
        maxTokens: generationSettings.reviewMaxTokens,
        schema: reviewSchema,
        system: reviewerPrompt({
          material,
          draft: evaluated.draft,
          pages: evaluated.pages,
        }),
        messages: [{ role: "user", content: "Review the draft." }],
      });
      // A draft still carrying a forbidden term is unusable as it stands.
      const rating = evaluated.forbidden.length > 0 ? 1 : (object?.rating ?? 1);
      return {
        ...evaluated,
        round,
        rating,
        gaps: object?.gaps ?? [],
        ...tokens([...usages, usage]),
      };
    };

    await progress(1, "drafting");
    const first = await ai.generateObject({
      purpose: "resume_strategist",
      role,
      maxTokens: generationSettings.draftMaxTokens,
      schema: resumeDraftSchema,
      system: strategistPrompt(material),
      messages: [{ role: "user", content: "Write the resume." }],
    });
    if (!first.object) throw new Error("The strategist returned no draft");

    const candidates = [await review(evaluate(first.object), 0, [first.usage])];
    for (let round = 1; round <= totalRounds; round++) {
      const previous = candidates.at(-1)!;
      const fits = previous.pages <= maxResumePages;
      if (fits && previous.rating >= generationSettings.targetRating) break;
      if (round > 1 && previous.rating <= candidates.at(-2)!.rating) break;
      // Step 2 is review round 1; the steps around it draft and save.
      await progress(round + 1, "review_round");
      const forbiddenTexts = resumeLines(previous.content)
        .filter((line) => previous.forbidden.includes(line.id))
        .map((line) => line.text);
      const edited = await ai.generateObject({
        purpose: "resume_editor",
        role,
        maxTokens: generationSettings.draftMaxTokens,
        schema: resumeDraftSchema,
        system: editorPrompt({
          material,
          draft: previous.draft,
          gaps: previous.gaps,
          dropped: previous.dropped,
          forbiddenLines: forbiddenTexts,
          pages: previous.pages,
        }),
        messages: [{ role: "user", content: "Apply the review." }],
      });
      if (!edited.object) break;
      candidates.push(
        await review(evaluate(edited.object), round, [edited.usage])
      );
    }

    // A draft within two pages beats a longer one; then the rating decides.
    const fits = (candidate: Candidate) => candidate.pages <= maxResumePages;
    const best = candidates.reduce((top, candidate) => {
      if (fits(candidate) !== fits(top))
        return fits(candidate) ? candidate : top;
      return candidate.rating > top.rating ? candidate : top;
    });
    // Code has the last word: lines with a forbidden term go, and a resume
    // whose real PDF runs over two pages loses the last bullets of its
    // oldest positions.
    const fitted = await fitToPages({
      content: withoutLines(best.content, best.forbidden),
      language: generation.language,
    });
    const { content } = fitted;
    if (lockedFactViolations(content, context.positions).length > 0) {
      throw new Error(`Generation ${generation.id} altered a locked fact`);
    }

    await progress(totalRounds + 2, "saving");
    const snapshotId = await db.transaction(async (tx) => {
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
      // A user edit saved meanwhile stays below: the generation lands on top.
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
      });
      await repository.insertReviewRounds(
        candidates.map((candidate) => ({
          generationId: generation.id,
          round: candidate.round,
          rating: candidate.rating,
          inputTokens: candidate.inputTokens,
          outputTokens: candidate.outputTokens,
          kept: candidate === best,
          encryptedReview: cipher.encrypt(JSON.stringify(candidate.gaps)),
        }))
      );
      await repository.updateGeneration(generation.id, {
        status: "completed",
        versionId: version.id,
        snapshotId: snapshot.id,
        bestRound: best.round,
        finishedAt: new Date(),
      });
      return snapshot.id;
    });
    // The PDF measured above is the snapshot's: kept, it downloads at once.
    if (deps.storage) {
      await storeRenderedPdf({
        db,
        cipher,
        storage: deps.storage,
        userId: deps.userId,
        profileId: profile.id,
        snapshotId,
        bytes: fitted.bytes,
        pages: fitted.pages,
      });
    }
  } catch (error) {
    await documents.updateGeneration(generation.id, {
      status: "failed",
      finishedAt: new Date(),
    });
    throw error;
  }
}

/** Removes the given lines (and a forbidden title line) from content. */
function withoutLines(
  content: ResumeContent,
  lineIds: string[]
): ResumeContent {
  if (lineIds.length === 0) return content;
  const keep = (line: { id: string }) => !lineIds.includes(line.id);
  return {
    ...content,
    header: {
      ...content.header,
      titleLine: lineIds.includes("title_line") ? "" : content.header.titleLine,
    },
    sections: content.sections.flatMap((section): ResumeSection[] => {
      switch (section.kind) {
        case "summary":
          return keep(section.line) ? [section] : [];
        case "skills":
          return [
            {
              ...section,
              groups: section.groups.filter(
                (group) => keep(group) && !lineIds.includes(`label:${group.id}`)
              ),
            },
          ];
        case "experience":
          return [
            {
              ...section,
              entries: section.entries.map((entry) => ({
                ...entry,
                context: lineIds.includes(`context:${entry.positionId}`)
                  ? null
                  : entry.context,
                lines: entry.lines.filter(keep),
              })),
            },
          ];
        case "projects":
          return [
            {
              ...section,
              entries: section.entries.map((entry) => ({
                ...entry,
                lines: entry.lines.filter(keep),
              })),
            },
          ];
        default:
          return [section];
      }
    }),
  };
}

/** The opening as generation sees it: its terms and its latest fit check. */
export async function loadOpeningBrief(input: {
  db: DbClient;
  cipher: UserCipher;
  openingId: string;
}): Promise<OpeningBrief> {
  const { cipher } = input;
  const openings = new OpeningsRepository(input.db);
  const opening = await openings.findOpeningById(input.openingId);
  if (!opening) throw new Error(`Opening ${input.openingId} not found`);
  const open = (value: string | null) => (value ? cipher.decrypt(value) : null);
  const terms = await openings.listTerms(opening.id);
  const [fitCheck] = await openings.latestFitChecks([opening.id]);
  const items = fitCheck ? await openings.listFitCheckItems(fitCheck.id) : [];
  const termText = new Map(
    terms.map((term) => [term.id, cipher.decrypt(term.encryptedText)])
  );
  return {
    title: open(opening.encryptedTitle),
    company: open(opening.encryptedCompany),
    terms: terms.map((term) => ({
      kind: term.kind,
      category: term.category,
      text: termText.get(term.id)!,
    })),
    fitCheck: items.map((item) => ({
      term: termText.get(item.termId) ?? "",
      verdict: item.verdict,
      evidenceIds: item.evidenceIds,
    })),
  };
}
