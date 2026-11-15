import { z } from "zod";

/** Languages the interview can be held in (and the interface shown in). */
export const careerLanguages = ["en-US", "pt-BR"] as const;
export const careerLanguageSchema = z.enum(careerLanguages);
export type CareerLanguage = z.infer<typeof careerLanguageSchema>;

/** A month, the precision resumes give: `2021-03`. */
export const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
export type YearMonth = z.infer<typeof yearMonthSchema>;

export const positionStatuses = [
  "pending",
  "in_progress",
  "approved",
  "removed",
] as const;
export const positionStatusSchema = z.enum(positionStatuses);
export type PositionStatus = z.infer<typeof positionStatusSchema>;

export const positionOrigins = ["imported", "manual", "interview"] as const;
export const positionOriginSchema = z.enum(positionOrigins);
export type PositionOrigin = z.infer<typeof positionOriginSchema>;

/** The full six-stage script or the short one (highlights only). */
export const scriptKindSchema = z.enum(["full", "short"]);
export type ScriptKind = z.infer<typeof scriptKindSchema>;

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

export const sourceDocumentStatusSchema = z.enum([
  "pending",
  "processing",
  "processed",
  "rejected",
  "failed",
]);
export type SourceDocumentStatus = z.infer<typeof sourceDocumentStatusSchema>;

/** A locked fact whose sources disagree, kept for the user to pick. */
export const conflictFieldSchema = z.enum(["title", "startDate", "endDate"]);
export type ConflictField = z.infer<typeof conflictFieldSchema>;

export const timelineProposalKindSchema = z.enum([
  "update_position",
  "add_position",
  "remove_position",
  "merge_positions",
  "split_position",
]);
export type TimelineProposalKind = z.infer<typeof timelineProposalKindSchema>;
