import { z } from "zod";

import {
  KeyUnusableError,
  type AiUsage,
} from "@repo/api/domains/ai/providers/provider-package";
import type { AiClient } from "@repo/api/domains/ai/ai-client";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadNeverIncludeFilter } from "@repo/api/domains/profile/rules/load-never-include-filter";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { TaskProgress } from "@repo/api/domains/tasks/schemas/task";
import type { DbClient } from "@repo/api/tools/db-client";
import { logger } from "@repo/common/tools/logger";
import { foldAccents } from "@repo/api/utils/text/fold-accents";
import type { Storage } from "@repo/api/tools/storage/storage";

import { decryptResume } from "../snapshot-content";
import type { CoverageReviewContent } from "../coverage-review/coverage-review";
import { reviewCoverage } from "../coverage-review/run-coverage-review";
import { DocumentsRepository } from "../documents-repository";
import { fitToPages } from "../rendering/fit-to-pages";
import { storeRenderedPdf } from "../rendering/store-rendered-pdf";
import {
  defaultGenerationSettings,
  experienceAge,
  generationSettingsSchema,
} from "../schemas/generation-settings";
import type { ResumeContent, ResumeSection } from "../schemas/resume-content";
import { loadWritingSetup } from "../writing/load-writing-setup";
import { resolveSections } from "../template/resolve-sections";
import {
  adjustDraftSchema,
  adjustmentDraft,
  relinkReference,
} from "./adjust-resume";
import {
  assembleResume,
  type AssemblyDraft,
  type DroppedLine,
  type ResumeDraft,
  resumeDraftSchema,
} from "./assemble-resume";
import { reviewLoopSettings } from "./review-loop-settings";
import { loadCareerContext } from "./load-career-context";
import {
  adjusterPrompt,
  editorPrompt,
  type OpeningBrief,
  purposesOf,
  resumeMaterial,
  reviewerPrompt,
  strategistPrompt,
} from "./resume-prompts";
import {
  estimatePages,
  findForbiddenLines,
  lockedFactViolations,
  resumeLines,
  resumeText,
} from "./resume-checks";

const reviewSchema = z.object({
  coverage: z
    .array(
      z.object({
        requirement: z.string(),
        level: z.enum(["strong", "partial", "not_proven"]),
      })
    )
    .catch([]),
  inconsistencies: z.array(z.string()).catch([]),
  advice: z.array(z.string()).catch([]),
});
type Review = z.infer<typeof reviewSchema>;

type Candidate = {
  round: number;
  draft: AssemblyDraft;
  content: ResumeContent;
  dropped: DroppedLine[];
  forbidden: string[];
  pages: number;
  rating: number;
  review: Review;
  inputTokens: number;
  outputTokens: number;
};

const tokens = (usages: AiUsage[]) => ({
  inputTokens: usages.reduce((sum, u) => sum + u.inputTokens, 0),
  outputTokens: usages.reduce((sum, u) => sum + u.outputTokens, 0),
});

const normalize = (text: string) => foldAccents(text).toLowerCase().trim();

/**
 * A draft's rating, from 1 to 10, by how much of its purpose it covers
 * (resume spec, "Review rounds"): strong coverage counts whole, partial
 * half. What the fit check found to be a gap is left out of the count: a
 * resume must not cover it, so it can't be held against it. A draft that
 * disagrees with the profile is never a good one.
 */
export function coverageRating(review: Review, gaps: string[]) {
  const lacking = new Set(gaps.map(normalize));
  const judged = review.coverage.filter(
    (item) => !lacking.has(normalize(item.requirement))
  );
  if (judged.length === 0) return 5;
  const covered = judged.reduce(
    (sum, item) =>
      sum + (item.level === "strong" ? 1 : item.level === "partial" ? 0.5 : 0),
    0
  );
  const rating = Math.min(
    10,
    Math.max(1, Math.round((10 * covered) / judged.length))
  );
  return review.inconsistencies.length > 0 ? Math.min(rating, 4) : rating;
}

/**
 * Generates a resume for an opening or a library focus, from the profile
 * version the generation froze (resume spec, "Generation rules"; the
 * method's prompts 04 and 04b).
 *
 * A new version: a strategist drafts, then each review round has a
 * reviewer judge the draft's coverage of its purpose against the profile
 * and an editor apply the review, only reordering and rewording. Quick
 * allows one round, Thorough more, stopping early at the target rating or
 * when coverage stops improving; the best-rated draft is kept.
 *
 * An adjustment (a reference resume was chosen): the model only reorders
 * that resume's bullets and competencies, rewrites its summary and may add
 * a bullet the profile has; nothing else changes.
 *
 * Code checks every draft: each line rests on the profile, figures only
 * where the profile marks them measured, competencies the person uses,
 * locked facts, the communication rules, and the generation settings
 * (bullets per experience, very old experiences, length). Every round is
 * stored, with what the document emphasizes. The final content gets the
 * method's coverage review (prompt 05), stored with its snapshot.
 */
export async function runGenerateResume(deps: {
  db: DbClient;
  ai: AiClient;
  cipher: UserCipher;
  userId: string;
  generationId: string;
  reportProgress?: (progress: TaskProgress) => Promise<void>;
  /** Where the final PDF is kept; without it, it is only measured. */
  storage?: Storage;
  /** This month (YYYY-MM): what "recent" is measured from. */
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
  // A key that runs out mid-review stops at a safe point (billing spec):
  // the best draft so far is saved, then the task stops.
  let stoppedBy: KeyUnusableError | null = null;
  try {
    const settings = generationSettingsSchema
      .catch(defaultGenerationSettings)
      .parse(generation.settings ?? defaultGenerationSettings);
    const today = deps.today ?? new Date().toISOString().slice(0, 7);
    // The frozen version's own rules, whatever was published since.
    const filter = await loadNeverIncludeFilter({
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
      openingId: application?.openingId,
      language: generation.language,
    });
    if (!context.profileVersionId) {
      throw new Error(`Generation ${generation.id} has no published profile`);
    }
    const brief: OpeningBrief = application
      ? await loadOpeningBrief({
          db,
          cipher,
          openingId: application.openingId,
          evidenceOfPassage: context.evidenceOfPassage,
        })
      : { title: focus, company: null, terms: [], fitCheck: [], focus };
    const referenceSnapshot = generation.referenceSnapshotId
      ? await documents.findSnapshot(generation.referenceSnapshotId)
      : null;
    const reference = referenceSnapshot
      ? relinkReference(
          decryptResume(cipher, referenceSnapshot),
          context.positions
        )
      : null;
    const setup = await loadWritingSetup({ db, cipher, userId: deps.userId });
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
      settings,
      today,
    });
    const purposes = purposesOf(brief);
    const gaps = brief.fitCheck
      .filter((item) => item.verdict === "gap")
      .map((item) => item.term);
    // Each position's age to this document; kept very old ones shorten
    // like older ones.
    const ages = new Map(
      context.positions.map((position) => {
        const age = experienceAge(position, settings, today);
        return [
          position.id,
          age === "very_old" && settings.veryOld === "keep" ? "older" : age,
        ] as const;
      })
    );
    const role = generation.writingLevel === "maximum" ? "maximum" : "writing";
    // An adjustment changes too little to be worth a round of rewriting.
    const totalRounds = reference
      ? 0
      : reviewLoopSettings.reviewRounds[generation.reviewDepth];
    // Drafting, the review rounds, the coverage review, saving.
    const progress = (step: number, label: string) =>
      deps.reportProgress?.({ step, totalSteps: totalRounds + 3, label });

    const evaluate = (draft: AssemblyDraft) => {
      const { content, dropped } = assembleResume({
        draft,
        reference,
        context,
        sections,
        settings,
        today,
        purposes,
        // A library document has no opening title: the writer names it.
        targetTitle: application ? (brief.title ?? "") : null,
        fallbackName: setup.header.name,
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
        maxTokens: reviewLoopSettings.reviewMaxTokens,
        schema: reviewSchema,
        system: reviewerPrompt({
          material,
          resume: resumeText(evaluated.content),
          pages: evaluated.pages,
          maxPages: settings.resumeMaxPages,
        }),
        messages: [{ role: "user", content: "Review the resume." }],
      });
      const judged = object ?? {
        coverage: [],
        inconsistencies: [],
        advice: [],
      };
      return {
        ...evaluated,
        round,
        // A draft still carrying a forbidden term is unusable as it stands.
        rating:
          evaluated.forbidden.length > 0 ? 1 : coverageRating(judged, gaps),
        review: judged,
        ...tokens([...usages, usage]),
      };
    };

    await progress(1, "drafting");
    const candidates: Candidate[] = [];
    // An adjustment runs no review round, so nothing is judged or stored.
    let adjusted: ReturnType<typeof evaluate> | null = null;
    if (reference) {
      const { object } = await ai.generateObject({
        purpose: "resume_adjuster",
        role,
        maxTokens: reviewLoopSettings.draftMaxTokens,
        schema: adjustDraftSchema,
        system: adjusterPrompt({ material, settings, reference }),
        messages: [{ role: "user", content: "Adjust the resume." }],
      });
      if (!object) throw new Error("The adjuster returned no draft");
      adjusted = evaluate(adjustmentDraft(object, reference));
    } else {
      const first = await ai.generateObject({
        purpose: "resume_strategist",
        role,
        maxTokens: reviewLoopSettings.draftMaxTokens,
        schema: resumeDraftSchema,
        system: strategistPrompt(material, settings),
        messages: [{ role: "user", content: "Write the resume." }],
      });
      if (!first.object) throw new Error("The strategist returned no draft");
      let draft: ResumeDraft = first.object;
      candidates.push(await review(evaluate(draft), 0, [first.usage]));
      for (let round = 1; round <= totalRounds; round++) {
        const previous = candidates.at(-1)!;
        const fits = previous.pages <= settings.resumeMaxPages;
        if (fits && previous.rating >= reviewLoopSettings.targetRating) break;
        // Coverage stopped improving.
        if (round > 1 && previous.rating <= candidates.at(-2)!.rating) break;
        // Step 2 is review round 1; the steps around it draft and save.
        await progress(round + 1, "review_round");
        const forbiddenTexts = resumeLines(previous.content)
          .filter((line) => previous.forbidden.includes(line.id))
          .map((line) => line.text);
        try {
          const edited = await ai.generateObject({
            purpose: "resume_editor",
            role,
            maxTokens: reviewLoopSettings.draftMaxTokens,
            schema: resumeDraftSchema,
            system: editorPrompt({
              material,
              settings,
              draft,
              advice: previous.review.advice,
              inconsistencies: previous.review.inconsistencies,
              dropped: previous.dropped,
              forbiddenLines: forbiddenTexts,
              pages: previous.pages,
            }),
            messages: [{ role: "user", content: "Apply the review." }],
          });
          if (!edited.object) break;
          draft = edited.object;
          candidates.push(await review(evaluate(draft), round, [edited.usage]));
        } catch (error) {
          if (!(error instanceof KeyUnusableError)) throw error;
          stoppedBy = error;
          break;
        }
      }
    }

    // A draft within its pages beats a longer one; then the rating decides.
    const fits = (candidate: Candidate) =>
      candidate.pages <= settings.resumeMaxPages;
    const bestRound =
      candidates.length > 0
        ? candidates.reduce((top, candidate) => {
            if (fits(candidate) !== fits(top))
              return fits(candidate) ? candidate : top;
            return candidate.rating > top.rating ? candidate : top;
          })
        : null;
    const best = bestRound ?? adjusted!;
    // Code has the last word: lines with a forbidden term go, and a resume
    // whose real PDF runs over its pages is shortened in the settings'
    // order, never touching the bullets of recent experiences.
    const fitted = await fitToPages({
      content: withoutLines(best.content, best.forbidden),
      language: generation.language,
      maxPages: settings.resumeMaxPages,
      ages,
    });
    const { content } = fitted;
    if (lockedFactViolations(content, context.positions).length > 0) {
      throw new Error(`Generation ${generation.id} altered a locked fact`);
    }
    const emphasis = best.draft.emphasis
      .map((line) => line.trim())
      .filter((line) => line && filter.findForbiddenTerms(line).length === 0)
      .slice(0, maxEmphasisLines);

    // The coverage review, once, on the final content. It never costs the
    // document: if it fails (a key that ran out, a provider error), the
    // resume is saved without one, and the code checks still run on it.
    let coverage: CoverageReviewContent | null = null;
    if (!stoppedBy) {
      await progress(totalRounds + 2, "coverage_review");
      try {
        coverage = await reviewCoverage({
          ai,
          content,
          context,
          brief,
          purposes,
          language: generation.language,
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
    }

    await progress(totalRounds + 3, "saving");
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
      await repository.insertReviewRounds(
        candidates.map((candidate) => ({
          generationId: generation.id,
          round: candidate.round,
          rating: candidate.rating,
          inputTokens: candidate.inputTokens,
          outputTokens: candidate.outputTokens,
          kept: candidate === bestRound,
          encryptedReview: cipher.encrypt(JSON.stringify(candidate.review)),
        }))
      );
      await repository.updateGeneration(generation.id, {
        status: "completed",
        versionId: version.id,
        snapshotId: snapshot.id,
        bestRound: bestRound?.round ?? null,
        encryptedEmphasis: emphasis.length
          ? cipher.encrypt(JSON.stringify(emphasis))
          : null,
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
  // Saved: the task still stops so the user sees why.
  if (stoppedBy) throw stoppedBy;
}

// What a document emphasizes is told in a few lines (resume spec).
const maxEmphasisLines = 5;

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

/**
 * The opening as generation sees it: its requirements and its latest fit
 * check, each verdict with the profile lines behind it (those of the
 * version the document froze; a fit check made on another version names
 * passages this one doesn't have, and they are left out).
 */
export async function loadOpeningBrief(input: {
  db: DbClient;
  cipher: UserCipher;
  openingId: string;
  evidenceOfPassage?: Map<string, string[]>;
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
      importance: term.importance,
      text: termText.get(term.id)!,
    })),
    fitCheck: items.map((item) => ({
      term: termText.get(item.termId) ?? "",
      verdict: item.verdict,
      evidenceIds: item.evidenceIds.flatMap(
        (passageId) => input.evidenceOfPassage?.get(passageId) ?? []
      ),
    })),
  };
}
