/**
 * The round a review loop keeps (resume spec, "Review rounds"): one with
 * no contradiction beats any with some; then one within the page limit
 * beats a longer one; then the highest rating. The first of equals wins.
 * A generation's rounds and a parallel re-review's reviewers share it.
 */
export function pickBestRound<
  T extends { contradictions: number; pages: number; rating: number },
>(candidates: T[], maxPages: number): T | null {
  const fits = (candidate: T) => candidate.pages <= maxPages;
  return candidates.length > 0
    ? candidates.reduce((top, candidate) => {
        if ((candidate.contradictions === 0) !== (top.contradictions === 0))
          return candidate.contradictions === 0 ? candidate : top;
        if (fits(candidate) !== fits(top))
          return fits(candidate) ? candidate : top;
        return candidate.rating > top.rating ? candidate : top;
      })
    : null;
}
