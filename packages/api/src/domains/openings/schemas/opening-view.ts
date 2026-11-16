import { z } from "zod";

import { interviewLanguageSchema } from "@repo/api/domains/career/schemas/career";
import { applicationStatusSchema } from "@repo/api/domains/applications/schemas/application";
import { evidenceKindSchema } from "@repo/api/domains/evidence/schemas/evidence";

import {
  fitBandSchema,
  fitVerdictSchema,
  openingKindSchema,
  openingRejectionReasonSchema,
  openingStatusSchema,
  openingTermCategorySchema,
  openingTermKindSchema,
  toneSchema,
} from "./opening";

export const openingSummarySchema = z.object({
  id: z.uuid(),
  kind: openingKindSchema,
  status: openingStatusSchema,
  company: z.string().nullable(),
  title: z.string().nullable(),
  band: fitBandSchema.nullable(),
  // The tracker's status once the opening has an application.
  applicationStatus: applicationStatusSchema.nullable(),
  createdAt: z.date(),
});
export type OpeningSummary = z.infer<typeof openingSummarySchema>;

export const fitCheckItemViewSchema = z.object({
  id: z.uuid(),
  term: z.string(),
  termKind: openingTermKindSchema,
  category: openingTermCategorySchema,
  verdict: fitVerdictSchema,
  explanation: z.string(),
  evidence: z.array(
    z.object({ id: z.uuid(), kind: evidenceKindSchema, text: z.string() })
  ),
  gapQuestion: z.string().nullable(),
  gapAnswer: z.string().nullable(),
});
export type FitCheckItemView = z.infer<typeof fitCheckItemViewSchema>;

export const openingDetailSchema = openingSummarySchema.extend({
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
    })
    .nullable(),
});
export type OpeningDetail = z.infer<typeof openingDetailSchema>;
