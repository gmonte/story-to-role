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
  // Registered by hand with an external application, not analyzed.
  "external",
]);
export type OpeningStatus = z.infer<typeof openingStatusSchema>;

/** Why an opening was refused: no text, not an opening, or the link failed. */
export const openingRejectionReasonSchema = z.enum([
  "empty",
  "not_an_opening",
  "link_invalid_url",
  "link_blocked_address",
  "link_too_many_redirects",
  "link_unsupported_type",
  "link_too_large",
  "link_unreachable",
  "link_needs_paste",
]);
export type OpeningRejectionReason = z.infer<
  typeof openingRejectionReasonSchema
>;

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
  // A condition of the job: schedule or availability, travel, contract
  // type, start date, salary, language level.
  "condition",
  "other",
]);
export type OpeningTermCategory = z.infer<typeof openingTermCategorySchema>;

/**
 * Requirements that are conditions of the job, not skills: the user answers
 * them with how they stand (met, not a blocker, a blocker), not with a story.
 */
export const conditionCategories: OpeningTermCategory[] = [
  "location",
  "work_model",
  "condition",
];

/** How the user stands on a condition of an opening. */
export const conditionStanceSchema = z.enum([
  "meets",
  "not_blocker",
  "blocker",
]);
export type ConditionStance = z.infer<typeof conditionStanceSchema>;

/** What the opening requires, and what it only wishes for. */
export const openingTermImportanceSchema = z.enum(["mandatory", "desirable"]);
export type OpeningTermImportance = z.infer<typeof openingTermImportanceSchema>;

/** Requirements answered by the job preferences, not by a profile passage. */
export const preferenceCategories: OpeningTermCategory[] = [
  "location",
  "work_model",
];

/** The method's warning signs for discarding an opening (step 03). */
export const openingWarningSchema = z.enum([
  "vague_company",
  "messaging_only_contact",
  "pay_too_good",
  "asks_payment_or_data",
  "code_download_test",
]);
export type OpeningWarning = z.infer<typeof openingWarningSchema>;

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
