import { z } from "zod";

import {
  credentialKindSchema,
  credentialStatusSchema,
  interviewLanguageSchema,
  sourceDocumentKindSchema,
  yearMonthSchema,
} from "./career";

export const positionInputSchema = z.object({
  employer: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  startDate: yearMonthSchema.optional(),
  // Absent end date: the user still holds the position.
  endDate: yearMonthSchema.optional(),
  location: z.string().trim().max(200).optional(),
});
export type PositionInput = z.infer<typeof positionInputSchema>;

export const credentialInputSchema = z.object({
  kind: credentialKindSchema,
  institution: z.string().trim().max(200).optional(),
  title: z.string().trim().min(1).max(200),
  level: z.string().trim().max(50).optional(),
  startDate: yearMonthSchema.optional(),
  endDate: yearMonthSchema.optional(),
  status: credentialStatusSchema.default("completed"),
});
export type CredentialInput = z.infer<typeof credentialInputSchema>;

export const sourceDocumentViewSchema = z.object({
  id: z.uuid(),
  kind: sourceDocumentKindSchema,
  fileName: z.string(),
  createdAt: z.date(),
});

/** Read-only: a PDF is shown as page images, anything else as plain text. */
export const documentPreviewSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pdf"), pageCount: z.number().int() }),
  z.object({ type: z.literal("text"), text: z.string() }),
]);
export type DocumentPreview = z.infer<typeof documentPreviewSchema>;

export const careerProfileViewSchema = z.object({
  interviewLanguage: interviewLanguageSchema,
  privacyNoticeAccepted: z.boolean(),
});

/** My career until the profile editor (P1): the profile and its sources. */
export const timelineSchema = z.object({
  profile: careerProfileViewSchema,
  documents: z.array(sourceDocumentViewSchema),
});
export type Timeline = z.infer<typeof timelineSchema>;
