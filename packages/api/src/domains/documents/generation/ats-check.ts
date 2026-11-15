import { foldAccents } from "@repo/api/utils/text/fold-accents";

export type AtsCheck = {
  matched: string[];
  /** The evidence holds it under another spelling: use the opening's term. */
  useOpeningTerm: string[];
  realGaps: string[];
  total: number;
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Compares a resume against the opening's keywords literally, the way an
 * applicant tracking system reads it (resume spec, "ATS check"). A missing
 * keyword is "use the opening's term" only when the fit check found
 * evidence for it; otherwise it is a real gap.
 */
export function atsCheck(input: {
  text: string;
  keywords: Array<{ term: string; backedByEvidence: boolean }>;
}): AtsCheck {
  const text = foldAccents(input.text).toLowerCase();
  const literal = (term: string) =>
    new RegExp(
      `(^|[^\\p{L}\\p{N}])${escape(foldAccents(term).toLowerCase())}($|[^\\p{L}\\p{N}])`,
      "u"
    ).test(text);

  const result: AtsCheck = {
    matched: [],
    useOpeningTerm: [],
    realGaps: [],
    total: input.keywords.length,
  };
  for (const keyword of input.keywords) {
    if (literal(keyword.term)) result.matched.push(keyword.term);
    else if (keyword.backedByEvidence) result.useOpeningTerm.push(keyword.term);
    else result.realGaps.push(keyword.term);
  }
  return result;
}
