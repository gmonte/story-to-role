import { z } from "zod";

import { taskProgressSchema } from "@repo/api/domains/tasks/schemas/task";

import {
  interviewLanguageSchema,
  sourceDocumentKindSchema,
  sourceImportRejectionSchema,
  sourceImportStatusSchema,
} from "./career";

export const sourceDocumentViewSchema = z.object({
  id: z.uuid(),
  kind: sourceDocumentKindSchema,
  fileName: z.string(),
  createdAt: z.date(),
  // Reading it into profile suggestions: null until an import starts.
  importStatus: sourceImportStatusSchema.nullable(),
  importRejection: sourceImportRejectionSchema.nullable(),
  importProgress: taskProgressSchema.nullable(),
  // The agent hasn't said the import's summary in the chat yet.
  summaryPending: z.boolean(),
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
