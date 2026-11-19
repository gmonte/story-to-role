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
  rating: number;
  kept: boolean;
  encryptedReview: string | null;
};

/**
 * The rating a resume was generated with, for the interface: every
 * round's rating and the counts behind the kept round's. Null without
 * rounds (an adjustment, a copy, a letter).
 */
export function reviewViewOf(
  rows: RoundRow[],
  cipher: UserCipher,
  purpose: "opening" | "focus"
) {
  if (rows.length === 0) return null;
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
  };
}
