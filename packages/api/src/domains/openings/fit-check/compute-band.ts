import type {
  FitBand,
  FitVerdict,
  OpeningTermImportance,
} from "../schemas/opening";

export type JudgedTerm = {
  importance: OpeningTermImportance;
  verdict: FitVerdict;
};

const credit: Record<FitVerdict, number> = { met: 1, partial: 0.5, gap: 0 };

const coverageOf = (terms: JudgedTerm[]) =>
  terms.reduce((sum, term) => sum + credit[term.verdict], 0) / terms.length;

/**
 * The fit check's band, decided by code from the judged terms, as the
 * method's screening defines it (step 03). It is a hint shown as high,
 * medium or low, never as a percentage: the analysis doesn't have that
 * precision.
 *
 * The mandatory requirements are read by proportion, met counting whole and
 * partial half (one gap among many is not a low fit):
 *
 * - High: at least 85% covered, and none missing.
 * - Medium: at least 60% covered.
 * - Low: less than that, or the opening breaks one of the user's job
 *   preferences.
 *
 * An opening that names nothing as mandatory is read by how much of what it
 * asks for the profile covers.
 */
export function computeBand(
  terms: JudgedTerm[],
  { breaksPreference = false }: { breaksPreference?: boolean } = {}
): FitBand {
  if (breaksPreference || terms.length === 0) return "low";
  const mandatory = terms.filter((term) => term.importance === "mandatory");
  if (mandatory.length > 0) {
    const covered = coverageOf(mandatory);
    const missing = mandatory.some((term) => term.verdict === "gap");
    if (covered >= 0.85 && !missing) return "high";
    return covered >= 0.6 ? "medium" : "low";
  }
  const coverage = coverageOf(terms);
  return coverage >= 0.75 ? "high" : coverage >= 0.4 ? "medium" : "low";
}
