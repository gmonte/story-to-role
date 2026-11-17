import { z } from "zod";

/** Languages the interview can be held in (and the interface shown in). */
export const interviewLanguages = ["en-US", "pt-BR"] as const;
export const interviewLanguageSchema = z.enum(interviewLanguages);
export type InterviewLanguage = z.infer<typeof interviewLanguageSchema>;

/** A month, the precision resumes give: `2021-03`. */
export const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
export type YearMonth = z.infer<typeof yearMonthSchema>;

// A position's column types: until the published profile's extract (P2)
// writes positions, only "manual" ones are added.
export type PositionStatus = "pending" | "approved" | "removed";
export type PositionOrigin = "manual";

/**
 * How the user starts (workspace spec, "Onboarding"): with an opening in
 * mind, or organizing their career first.
 */
export const startPathSchema = z.enum(["opening", "career"]);
export type StartPath = z.infer<typeof startPathSchema>;

export const credentialKinds = [
  "education",
  "certification",
  "language",
  "course",
  "publication",
  "award",
  "volunteering",
] as const;
export const credentialKindSchema = z.enum(credentialKinds);
export type CredentialKind = z.infer<typeof credentialKindSchema>;

export const credentialStatusSchema = z.enum([
  "completed",
  "in_progress",
  "do_not_use",
]);
export type CredentialStatus = z.infer<typeof credentialStatusSchema>;

export const sourceDocumentKindSchema = z.enum(["resume", "truth_file"]);
export type SourceDocumentKind = z.infer<typeof sourceDocumentKindSchema>;

export const sourceImportStatusSchema = z.enum([
  "importing",
  "imported",
  "rejected",
  "failed",
]);
export type SourceImportStatus = z.infer<typeof sourceImportStatusSchema>;

/** Why a file wasn't imported: code read it, or the content check did. */
export const sourceImportRejectionSchema = z.enum([
  "too_many_pages",
  "too_long",
  "too_short",
  "unreadable",
  "not_a_career_document",
]);
export type SourceImportRejection = z.infer<typeof sourceImportRejectionSchema>;
