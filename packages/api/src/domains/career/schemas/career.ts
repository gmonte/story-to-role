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

export const positionStatuses = [
  "pending",
  "in_progress",
  "approved",
  "removed",
] as const;
export const positionStatusSchema = z.enum(positionStatuses);
export type PositionStatus = z.infer<typeof positionStatusSchema>;

// "truth_file": proposed as imported from the user's own truth file.
export const positionOrigins = [
  "imported",
  "truth_file",
  "manual",
  "interview",
] as const;
export const positionOriginSchema = z.enum(positionOrigins);
export type PositionOrigin = z.infer<typeof positionOriginSchema>;

/**
 * How the user starts (workspace spec, "Onboarding"): with an opening in
 * mind, or organizing their career first.
 */
export const startPathSchema = z.enum(["opening", "career"]);
export type StartPath = z.infer<typeof startPathSchema>;

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
  "resolve_conflict",
  "add_position",
  "remove_position",
  "merge_positions",
  "split_position",
]);
export type TimelineProposalKind = z.infer<typeof timelineProposalKindSchema>;

/**
 * Who set the career language: the user (before evidence existed). Older
 * profiles may say a file or a message set it, as they once could.
 */
export const interviewLanguageSourceSchema = z.enum([
  "file",
  "message",
  "user",
]);
export type InterviewLanguageSource = z.infer<
  typeof interviewLanguageSourceSchema
>;

/** What the user did to their career outside the chat. */
export const careerEventKinds = [
  "position_added",
  "position_edited",
  "position_removed",
  "positions_merged",
  "conflict_resolved",
  "facts_approved",
  "imported_approved",
  "credential_added",
  "credential_edited",
  "credential_approved",
  "credential_removed",
  "credentials_merged",
  "source_removed",
  "fact_edited",
  "fact_removed",
  "position_chat",
  "account_approved",
] as const;
export type CareerEventKind = (typeof careerEventKinds)[number];

/** Who wrote a version of a position's account. */
export const accountSources = [
  "user",
  "interviewer",
  "import",
  "migration",
] as const;
export type AccountSource = (typeof accountSources)[number];
