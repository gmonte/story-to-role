import type { ReviewDepth } from "../schemas/document";

/**
 * Review rounds (resume spec, "Review rounds"): the number behind each depth
 * is a setting, tuned with the ratings stored per round.
 */
export const generationSettings = {
  reviewRounds: { quick: 1, thorough: 3 } satisfies Record<ReviewDepth, number>,
  // Thorough stops early once a draft reaches this rating (1 to 10).
  targetRating: 8,
  draftMaxTokens: 8_192,
  reviewMaxTokens: 2_048,
};
