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

/**
 * The fit check's band, decided by code from the judged terms, as the
 * method's screening defines it (step 03). It is a hint shown as high,
 * medium or low, never as a percentage: the analysis doesn't have that
 * precision.
 *
 * - High: every mandatory requirement is met.
 * - Medium: none is missing, but some are met only in part.
 * - Low: a mandatory requirement is missing, or the opening breaks one of
 *   the user's job preferences.
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
  if (mandatory.some((term) => term.verdict === "gap")) return "low";
  if (mandatory.length > 0) {
    return mandatory.every((term) => term.verdict === "met")
      ? "high"
      : "medium";
  }
  const coverage =
    terms.reduce((sum, term) => sum + credit[term.verdict], 0) / terms.length;
  return coverage >= 0.75 ? "high" : coverage >= 0.4 ? "medium" : "low";
}
