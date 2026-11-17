import { z } from "zod";

import { taskProgressSchema } from "@repo/api/domains/tasks/schemas/task";
import { interviewLanguageSchema } from "@repo/api/domains/career/schemas/career";
import { applicationStatusSchema } from "@repo/api/domains/applications/schemas/application";

import {
  fitBandSchema,
  fitVerdictSchema,
  openingKindSchema,
  openingRejectionReasonSchema,
  openingStatusSchema,
  openingTermCategorySchema,
  openingTermImportanceSchema,
  openingTermKindSchema,
  openingWarningSchema,
  toneSchema,
} from "./opening";

export const openingSummarySchema = z.object({
  id: z.uuid(),
  kind: openingKindSchema,
  status: openingStatusSchema,
  company: z.string().nullable(),
  title: z.string().nullable(),
  band: fitBandSchema.nullable(),
  // The tracker's application, once the opening has one.
  applicationId: z.uuid().nullable(),
  applicationStatus: applicationStatusSchema.nullable(),
  createdAt: z.date(),
});
export type OpeningSummary = z.infer<typeof openingSummarySchema>;

export const fitCheckItemViewSchema = z.object({
  id: z.uuid(),
  term: z.string(),
  termKind: openingTermKindSchema,
  category: openingTermCategorySchema,
  importance: openingTermImportanceSchema,
  verdict: fitVerdictSchema,
  explanation: z.string(),
  // The profile passages that back the verdict ("without a passage, a
  // verdict is an opinion").
  passages: z.array(z.object({ id: z.uuid(), text: z.string() })),
  gapQuestion: z.string().nullable(),
  gapAnswer: z.string().nullable(),
});
export type FitCheckItemView = z.infer<typeof fitCheckItemViewSchema>;

/** What a fit check stores for the preferences an opening breaks. */
export const preferenceConflictsSchema = z.array(
  z.object({ rule: z.string(), explanation: z.string() })
);

export const openingDetailSchema = openingSummarySchema.extend({
  // The analysis' live step while it runs (keys and counts, no content).
  progress: taskProgressSchema.nullable(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  rejectionReason: openingRejectionReasonSchema.nullable(),
  language: interviewLanguageSchema.nullable(),
  suggestedTone: toneSchema.nullable(),
  fitCheck: z
    .object({
      band: fitBandSchema,
      createdAt: z.date(),
      items: z.array(fitCheckItemViewSchema),
      // The job preferences the opening breaks: any makes the band low.
      preferenceConflicts: preferenceConflictsSchema,
      // The method's warning signs found in the posting.
      warnings: z.array(openingWarningSchema),
      // Whether the profile was published again since this check.
      outdated: z.boolean(),
    })
    .nullable(),
  // A posted opening analyzed before any profile was published: its fit
  // check waits for the user to publish and run it.
  needsPublishedProfile: z.boolean(),
});
export type OpeningDetail = z.infer<typeof openingDetailSchema>;
