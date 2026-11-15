import { z } from "zod";

import { applicationStatusSchema } from "@repo/api/domains/applications/schemas/application";
import { toneSchema } from "@repo/api/domains/openings/schemas/opening";
import { taskProgressSchema } from "@repo/api/domains/tasks/schemas/task";

import {
  documentKindSchema,
  generationKindSchema,
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
  source: z
    .discriminatedUnion("kind", [
      z.object({
        kind: z.literal("position"),
        title: z.string(),
        employer: z.string(),
      }),
      z.object({ kind: z.literal("credential"), title: z.string() }),
    ])
    .nullable(),
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
  pdf: z.object({
    // Rendered from the official snapshot; `pages` is then measured.
    ready: z.boolean(),
    rendering: z.boolean(),
    // The suggested name, which the user can edit before downloading.
    fileName: z.string(),
  }),
  atsCheck: atsCheckSchema.nullable(),
  trace: z.array(evidenceTraceSchema),
  instructionTrace: z.array(
    z.object({ instructionId: z.uuid(), text: z.string() })
  ),
  credentialApprovals: z.array(
    z.object({ credentialId: z.uuid(), approvedAt: z.date() })
  ),
  // Linked versions with changes this one has not received (language sync).
  outdated: z.array(
    z.object({
      versionId: z.uuid(),
      language: outputLanguageSchema,
      changes: z.number().int(),
      // No common ancestor left: only recreating links them again.
      baseMissing: z.boolean(),
    })
  ),
  // Titles proposed for this language and not approved yet.
  titleProposals: z.array(
    z.object({
      positionId: z.uuid(),
      current: z.string(),
      proposed: z.string(),
    })
  ),
});
export type VersionView = z.infer<typeof versionViewSchema>;

export const generationViewSchema = z.object({
  id: z.uuid(),
  kind: generationKindSchema,
  status: generationStatusSchema,
  versionId: z.uuid().nullable(),
  sourceVersionId: z.uuid().nullable(),
  language: outputLanguageSchema,
  reviewDepth: reviewDepthSchema,
  writingLevel: writingLevelSchema,
  progress: taskProgressSchema.nullable(),
  createdAt: z.date(),
});

export const documentViewSchema = z.object({
  id: z.uuid(),
  kind: documentKindSchema,
  versions: z.array(versionViewSchema),
  generation: generationViewSchema.nullable(),
  // A sync awaiting the user's review, and its changes to the target.
  proposal: z
    .object({
      generationId: z.uuid(),
      versionId: z.uuid(),
      lines: z.array(
        z.object({
          lineId: z.string(),
          before: z.string().nullable(),
          after: z.string().nullable(),
        })
      ),
    })
    .nullable(),
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
