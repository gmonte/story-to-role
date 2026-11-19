import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";

type Review = NonNullable<VersionView["review"]>;

/**
 * How the coverage score reads: good at the target or above, middling
 * from 5 up to it, low under 5; `capped` when an inconsistency with the
 * profile held it at 4 (resume spec, "Review rounds").
 */
export function coverageScoreBand(
  review: Pick<Review, "rating" | "target" | "inconsistencies">
): "good" | "middling" | "low" | "capped" {
  if (review.inconsistencies > 0 && review.rating <= 4) return "capped";
  if (review.rating >= review.target) return "good";
  if (review.rating >= 5) return "middling";
  return "low";
}

/** The ratings of the rounds in order: "6 · 7 · 8". */
export function roundsTrail(rounds: Array<{ rating: number }>) {
  return rounds.map((round) => round.rating).join(" · ");
}
