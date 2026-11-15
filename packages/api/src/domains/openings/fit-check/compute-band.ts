import {
  hardRequirementCategories,
  type FitBand,
  type FitVerdict,
  type OpeningTermCategory,
} from "../schemas/opening";

export type JudgedTerm = {
  category: OpeningTermCategory;
  verdict: FitVerdict;
};

const credit: Record<FitVerdict, number> = { met: 1, partial: 0.5, gap: 0 };

/**
 * The fit check's band, decided by code from the judged terms. It is a hint
 * shown as high, medium or low, never as a percentage (resume spec): the
 * analysis doesn't have that precision. A gap on a hard requirement
 * (seniority, years, location, language) caps the band, since stronger
 * skills can't make up for it.
 */
export function computeBand(terms: JudgedTerm[]): FitBand {
  if (terms.length === 0) return "low";

  const coverage =
    terms.reduce((sum, term) => sum + credit[term.verdict], 0) / terms.length;
  const hardGaps = terms.filter(
    (term) =>
      term.verdict === "gap" &&
      hardRequirementCategories.includes(term.category)
  ).length;

  const band: FitBand =
    coverage >= 0.75 ? "high" : coverage >= 0.45 ? "medium" : "low";
  if (hardGaps >= 2) return "low";
  if (hardGaps === 1 && band === "high") return "medium";
  return band;
}
