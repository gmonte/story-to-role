import { z } from "zod";

/** A posted vacancy, or a company the user approaches with no vacancy open. */
export const openingKindSchema = z.enum(["posted", "unsolicited"]);
export type OpeningKind = z.infer<typeof openingKindSchema>;

/**
 * Where an opening stands outside the tracker: still being read, analyzed
 * (applications move it on in later slices), refused, or closed by the user.
 */
export const openingStatusSchema = z.enum([
  "processing",
  "analyzed",
  "rejected",
  "closed",
]);
export type OpeningStatus = z.infer<typeof openingStatusSchema>;

/** What the opening asks for: a literal keyword, or a requirement. */
export const openingTermKindSchema = z.enum(["keyword", "requirement"]);
export type OpeningTermKind = z.infer<typeof openingTermKindSchema>;

export const openingTermCategorySchema = z.enum([
  "hard_skill",
  "tool",
  "certification",
  "language",
  "seniority",
  "years_of_experience",
  "location",
  "work_model",
  "other",
]);
export type OpeningTermCategory = z.infer<typeof openingTermCategorySchema>;

/** Requirements a history can't stretch to meet (they cap the band). */
export const hardRequirementCategories: OpeningTermCategory[] = [
  "seniority",
  "years_of_experience",
  "location",
  "language",
];

export const fitVerdictSchema = z.enum(["met", "partial", "gap"]);
export type FitVerdict = z.infer<typeof fitVerdictSchema>;

/** A hint, never a gate, and never a percentage (resume spec). */
export const fitBandSchema = z.enum(["high", "medium", "low"]);
export type FitBand = z.infer<typeof fitBandSchema>;

export const toneSchema = z.enum([
  "your_style",
  "formal",
  "direct",
  "warm",
  "technical",
]);
export type Tone = z.infer<typeof toneSchema>;
