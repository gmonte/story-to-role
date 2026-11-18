import { z } from "zod";

export const profileDocumentKindSchema = z.enum(["profile", "preferences"]);
export type ProfileDocumentKind = z.infer<typeof profileDocumentKindSchema>;

export const profileValidationStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
]);
export type ProfileValidationStatus = z.infer<
  typeof profileValidationStatusSchema
>;

export const profileFindingSchema = z.object({
  code: z.string(),
  kind: z.enum(["format", "content"]),
  line: z.number().int().nullable(),
  from: z.number().int(),
  to: z.number().int(),
  fixable: z.boolean(),
  params: z.record(z.string(), z.string()).optional(),
});

export const profileVersionSummarySchema = z.object({
  id: z.uuid(),
  number: z.number().int(),
  publishedAt: z.date(),
  validatedAt: z.date().nullable(),
});
export type ProfileVersionSummary = z.infer<typeof profileVersionSummarySchema>;

export const profileDraftSchema = z.object({
  markdown: z.string(),
  // 0 for a profile never saved (the template).
  revision: z.number().int(),
  updatedAt: z.date().nullable(),
  publishedVersion: profileVersionSummarySchema.nullable(),
  // Whether the draft differs from the published version.
  changedSincePublished: z.boolean(),
  // Keys of the content findings the user ignored (`findingKey`).
  dismissedFindings: z.array(z.string()),
});
export type ProfileDraft = z.infer<typeof profileDraftSchema>;

// Generous for a long career; the editor keeps a profile well below it.
export const maxProfileLength = 200_000;

/** Who proposed a suggestion (profile spec, "Data model"). */
export const profileSuggestionOriginSchema = z.enum([
  "agent",
  "import",
  "validation",
  "application",
]);
export type ProfileSuggestionOrigin = z.infer<
  typeof profileSuggestionOriginSchema
>;

export const profileSuggestionStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  // A newer suggestion rewrote the same lines before the user answered.
  "superseded",
]);
export type ProfileSuggestionStatus = z.infer<
  typeof profileSuggestionStatusSchema
>;

export const profileSuggestionSchema = z.object({
  id: z.uuid(),
  origin: profileSuggestionOriginSchema,
  createdAt: z.date(),
  part: z.string(),
  find: z.string(),
  replace: z.string(),
  reason: z.string(),
});
export type ProfileSuggestion = z.infer<typeof profileSuggestionSchema>;
