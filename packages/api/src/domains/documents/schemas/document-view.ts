import { z } from "zod";

import { applicationStatusSchema } from "@repo/api/domains/applications/schemas/application";
import { toneSchema } from "@repo/api/domains/openings/schemas/opening";

import {
  documentKindSchema,
  generationStatusSchema,
  outputLanguageSchema,
  reviewDepthSchema,
  snapshotAuthorSchema,
  snapshotOriginSchema,
  writingLevelSchema,
} from "./document";
import { resumeContentSchema, resumeSectionKindSchema } from "./resume-content";

/** Where an evidence line came from, for the editor's trace. */
export const evidenceTraceSchema = z.object({
  evidenceId: z.uuid(),
  text: z.string(),
  quote: z.string(),
  source: z.string().nullable(),
  approvedAt: z.date(),
});
export type EvidenceTrace = z.infer<typeof evidenceTraceSchema>;

export const atsCheckSchema = z.object({
  matched: z.array(z.string()),
  useOpeningTerm: z.array(z.string()),
  realGaps: z.array(z.string()),
  total: z.number().int(),
});

export const snapshotSummarySchema = z.object({
  id: z.uuid(),
  sequence: z.number().int(),
  origin: snapshotOriginSchema,
  author: snapshotAuthorSchema,
  createdAt: z.date(),
});
export type SnapshotSummary = z.infer<typeof snapshotSummarySchema>;

export const versionViewSchema = z.object({
  id: z.uuid(),
  language: outputLanguageSchema,
  label: z.string().nullable(),
  snapshot: snapshotSummarySchema,
  snapshotCount: z.number().int(),
  content: resumeContentSchema,
  pages: z.number(),
  atsCheck: atsCheckSchema.nullable(),
  trace: z.array(evidenceTraceSchema),
});
export type VersionView = z.infer<typeof versionViewSchema>;

export const generationViewSchema = z.object({
  id: z.uuid(),
  status: generationStatusSchema,
  language: outputLanguageSchema,
  depth: reviewDepthSchema,
  writingLevel: writingLevelSchema,
  createdAt: z.date(),
});

export const documentViewSchema = z.object({
  id: z.uuid(),
  kind: documentKindSchema,
  versions: z.array(versionViewSchema),
  generation: generationViewSchema.nullable(),
});
export type DocumentView = z.infer<typeof documentViewSchema>;

export const openingDocumentsSchema = z.object({
  application: z
    .object({
      id: z.uuid(),
      status: applicationStatusSchema,
      tone: toneSchema,
      sectionsForcedIn: z.array(resumeSectionKindSchema),
      sectionsForcedOut: z.array(resumeSectionKindSchema),
    })
    .nullable(),
  documents: z.array(documentViewSchema),
});
export type OpeningDocuments = z.infer<typeof openingDocumentsSchema>;
