import type { AiClient } from "@repo/api/domains/ai/ai-client";
import { KeyUnusableError } from "@repo/api/domains/ai/providers/provider-package";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadNeverIncludeFilter } from "@repo/api/domains/profile/rules/load-never-include-filter";
import type { TaskProgress } from "@repo/api/domains/tasks/schemas/task";
import type { DbClient } from "@repo/api/tools/db-client";
import { logger } from "@repo/common/tools/logger";

import type { CoverageReviewContent } from "../coverage-review/coverage-review";
import { reviewCoverage } from "../coverage-review/run-coverage-review";
import {
  FrozenContexts,
  writtenSettings,
} from "../coverage-review/snapshot-coverage";
import { DocumentsRepository } from "../documents-repository";
import { pdfTemplate } from "../rendering/pdf-template";
import { decryptDocument } from "../snapshot-content";
import { resolveSections } from "../template/resolve-sections";
import { loadWritingSetup } from "../writing/load-writing-setup";
import { estimatePages, findForbiddenLines } from "./resume-checks";
import { purposesOf, resumeMaterial } from "./resume-prompts";
import { pickBestRound } from "./pick-best-round";
import { coverageRating, judgeResume } from "./review-resume";

/**
 * "Review again" (resume spec, "Review rounds"): one reviewer judges the
 * snapshot as it is now, with the same prompt, rating and fit-check gaps as
 * a generation's rounds, and the coverage review runs on it. Nothing is
 * rewritten: the rating and the coverage review are stored for that
 * snapshot, beside the rounds of the generation that wrote the version.
 */
export async function runReviewResume(deps: {
  db: DbClient;
  ai: AiClient;
  cipher: UserCipher;
  userId: string;
  snapshotId: string;
  /** Independent reviewers judging in parallel: 1 or 3. */
  reviewers?: number;
  reportProgress?: (progress: TaskProgress) => Promise<void>;
  /** This month (YYYY-MM): what "recent" is measured from. */
  today?: string;
}) {
  const { db, ai, cipher } = deps;
  const repository = new DocumentsRepository(db);
  const snapshot = await repository.findSnapshot(deps.snapshotId);
  const version =
    snapshot && (await repository.findVersion(snapshot.versionId));
  const document =
    version && (await repository.findDocument(version.documentId));
  const profile = await new CareerRepository(db).findProfileByUserId(
    deps.userId
  );
  if (!snapshot || !version || !document || !profile) {
    throw new Error(`Snapshot ${deps.snapshotId} not found`);
  }
  if (document.profileId !== profile.id) {
    throw new Error(`Snapshot ${deps.snapshotId} not found`);
  }
  const content = decryptDocument(cipher, snapshot);
  const written = await repository.latestWrittenGeneration(version.id);
  if (content.kind !== "resume" || !written) {
    throw new Error(`Snapshot ${snapshot.id} has no review to repeat`);
  }
  const progress = (step: number, label: string) =>
    deps.reportProgress?.({ step, totalSteps: 3, label });

  const settings = await writtenSettings(repository, version, written);
  const today = deps.today ?? new Date().toISOString().slice(0, 7);
  const contexts = new FrozenContexts(db, cipher, profile.id);
  const openingId = await contexts.openingOf(document.applicationId);
  const context = await contexts.load({
    profileVersionId: snapshot.profileVersionId,
    openingId,
    language: version.language,
  });
  const focus = document.encryptedFocus
    ? cipher.decrypt(document.encryptedFocus)
    : null;
  const brief = openingId
    ? await contexts.brief(openingId, context)
    : { title: focus, company: null, terms: [], fitCheck: [], focus };
  const application = document.applicationId
    ? await repository.findApplication(document.applicationId)
    : null;
  const setup = await loadWritingSetup({ db, cipher, userId: deps.userId });
  const material = resumeMaterial({
    context,
    opening: brief,
    sections: resolveSections({
      template: setup.templateSections,
      language: version.language,
      topics: [brief.title ?? "", ...brief.terms.map((term) => term.text)],
      forcedIn: application?.sectionsForcedIn ?? [],
      forcedOut: application?.sectionsForcedOut ?? [],
    }),
    language: version.language,
    tone: written.tone,
    style: setup.style,
    settings,
    today,
  });
  const filter = await loadNeverIncludeFilter({
    db,
    cipher,
    profileId: profile.id,
    profileVersionId: snapshot.profileVersionId,
  });
  const gaps = brief.fitCheck
    .filter((item) => item.verdict === "gap")
    .map((item) => item.term);
  const rendered = await repository.findRenderedFile(snapshot.id, pdfTemplate);
  const pages = rendered?.pages ?? estimatePages(content);

  await progress(1, "reviewing");
  // Independent reviewers, none seeing another: the same prompt and input.
  const reviewers = Math.max(1, deps.reviewers ?? 1);
  const candidates = await Promise.all(
    Array.from({ length: reviewers }, async () => {
      const { judged, usage } = await judgeResume({
        ai,
        material,
        content,
        pages,
        maxPages: settings.resumeMaxPages,
        feedbackLanguage: profile.interviewLanguage,
      });
      // The same rule as a generation's: a text still carrying a forbidden
      // term is rated 1.
      const rating =
        findForbiddenLines(content, filter).length > 0
          ? 1
          : coverageRating(judged, gaps);
      return {
        judged,
        usage,
        rating,
        pages,
        contradictions: judged.inconsistencies.length,
      };
    })
  );
  // Chosen as a generation's rounds are: no contradiction first, then the
  // highest rating.
  const best = pickBestRound(candidates, settings.resumeMaxPages)!;

  // The coverage review never costs the rating: if it fails, the rating
  // is kept without one.
  let coverage: CoverageReviewContent | null = null;
  let stoppedBy: KeyUnusableError | null = null;
  await progress(2, "coverage_review");
  try {
    coverage = await reviewCoverage({
      ai,
      content,
      context,
      brief,
      purposes: purposesOf(brief),
      language: version.language,
    });
  } catch (error) {
    if (error instanceof KeyUnusableError) {
      stoppedBy = error;
    } else {
      logger.warn(["documents"], "Coverage review failed", {
        snapshotId: snapshot.id,
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  await progress(3, "saving");
  await db.transaction(async (tx) => {
    const store = new DocumentsRepository(tx);
    const rounds = await store.listReviewRounds(written.id);
    const first = (rounds.at(-1)?.round ?? -1) + 1;
    await store.insertReviewRounds(
      candidates.map((candidate, index) => ({
        generationId: written.id,
        snapshotId: snapshot.id,
        round: first + index,
        rating: candidate.rating,
        inputTokens: candidate.usage.inputTokens,
        outputTokens: candidate.usage.outputTokens,
        kept: candidate === best,
        encryptedReview: cipher.encrypt(JSON.stringify(candidate.judged)),
      }))
    );
    if (coverage) {
      await store.insertCoverageReview({
        generationId: written.id,
        snapshotId: snapshot.id,
        profileVersionId: snapshot.profileVersionId,
        encryptedContent: cipher.encrypt(JSON.stringify(coverage)),
      });
    }
  });
  // Saved: the task still stops so the user sees why.
  if (stoppedBy) throw stoppedBy;
}
