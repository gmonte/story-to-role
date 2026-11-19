import { z } from "zod";

import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";

import { reviewLoopSettings } from "./review-loop-settings";

/** The review's shape as stored per round (see `run-generate-resume.ts`). */
const storedReviewSchema = z.object({
  coverage: z
    .array(
      z.object({
        requirement: z.string(),
        level: z.enum(["strong", "partial", "not_proven"]),
      })
    )
    .catch([]),
  inconsistencies: z.array(z.string()).catch([]),
});

type RoundRow = {
  round: number;
  snapshotId: string | null;
  rating: number;
  kept: boolean;
  encryptedReview: string | null;
};

/**
 * The rating the reviewers gave a resume, for the interface: every
 * round's rating and the counts behind the kept round's. The latest
 * review counts: a re-review of an edited text judged that snapshot, the
 * rounds of a generation the snapshot it wrote (`generationSnapshotId`).
 * `current` says it judged the version's latest snapshot. Null without
 * rounds (an adjustment, a copy, a letter).
 */
export function reviewViewOf(
  allRows: RoundRow[],
  cipher: UserCipher,
  purpose: "opening" | "focus",
  snapshots: { latestId: string; generationSnapshotId: string | null }
) {
  if (allRows.length === 0) return null;
  const judgedOf = (row: RoundRow) =>
    row.snapshotId ?? snapshots.generationSnapshotId;
  const reviewedId = judgedOf(allRows[allRows.length - 1]);
  const rows = allRows.filter((row) => judgedOf(row) === reviewedId);
  const kept = rows.find((row) => row.kept) ?? rows[rows.length - 1];
  const stored = kept.encryptedReview
    ? storedReviewSchema.safeParse(
        JSON.parse(cipher.decrypt(kept.encryptedReview))
      )
    : null;
  const review = stored?.success ? stored.data : null;
  return {
    rating: kept.rating,
    target: reviewLoopSettings.targetRating,
    rounds: rows.map(({ round, rating, kept: isKept }) => ({
      round,
      rating,
      kept: isKept,
    })),
    coveredStrong:
      review?.coverage.filter((item) => item.level === "strong").length ?? 0,
    coveredPartial:
      review?.coverage.filter((item) => item.level === "partial").length ?? 0,
    // Includes what the fit check marked a gap (not stored with the round).
    judged: review?.coverage.length ?? 0,
    inconsistencies: review?.inconsistencies.length ?? 0,
    purpose,
    current: reviewedId === snapshots.latestId,
    // The rating of a re-review of the text as edited, not of the draft.
    ofEdit: kept.snapshotId !== null,
  };
}
