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
import { coverageFindingCodes } from "../coverage-review/check-document";
import { documentContentSchema } from "./document-content";
import { resumeSectionKindSchema } from "./resume-content";

/**
 * A profile line a document line cites (resume spec, "Trace in the
 * editor"), read from the profile version the snapshot froze: its text
 * and the position it is in (null for a line of another section).
 */
export const evidenceTraceSchema = z.object({
  evidenceId: z.uuid(),
  text: z.string(),
  source: z
    .object({
      kind: z.literal("position"),
      title: z.string(),
      employer: z.string(),
    })
    .nullable(),
});
export type EvidenceTrace = z.infer<typeof evidenceTraceSchema>;

/** A code check's finding (coverage review): pointed out, never blocking. */
export const coverageFindingSchema = z.object({
  code: z.enum(coverageFindingCodes),
  lineId: z.string().nullable(),
  positionId: z.uuid().nullable(),
  text: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});

const reviewLine = z.object({ lineId: z.string(), lineText: z.string() });

/**
 * The AI part of the coverage review as the interface shows it: ids
 * resolved into the texts of the reviewed snapshot and the frozen profile.
 */
export const coverageReviewViewSchema = z.object({
  id: z.uuid(),
  createdAt: z.date(),
  sources: z.object({
    profileVersionNumber: z.number().int().nullable(),
    purpose: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("opening"),
        title: z.string().nullable(),
        company: z.string().nullable(),
      }),
      z.object({ kind: z.literal("focus"), focus: z.string() }),
    ]),
    instructions: z.number().int(),
  }),
  preserved: z.array(
    z.object({
      positionId: z.uuid(),
      employer: z.string(),
      title: z.string(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      bullets: z.number().int(),
      // A very old experience: the requirement it entered the document for.
      relevance: z.string().nullable(),
    })
  ),
  // Requirement → resume line → profile line that proves it.
  strong: z.array(
    reviewLine.extend({
      requirement: z.string(),
      evidence: evidenceTraceSchema,
    })
  ),
  partial: z.array(
    z.object({ requirement: z.string(), explanation: z.string() })
  ),
  gaps: z.array(z.string()),
  inconsistencies: z.array(reviewLine.extend({ explanation: z.string() })),
  // A `profile` suggestion can be sent to the profile's draft
  // (documents.sendToProfile) with the review's id and its lineId.
  suggestions: z.array(
    z.object({
      kind: z.enum(["reorder", "profile"]),
      lineId: z.string().nullable(),
      lineText: z.string().nullable(),
      text: z.string(),
    })
  ),
  statement: z.string(),
});
export type CoverageReviewView = z.infer<typeof coverageReviewViewSchema>;

/**
 * A resume version's coverage review (resume spec, "Coverage review"): the
 * code checks run live on the official snapshot, and the latest AI review
 * of the version, which is `current` when it reviewed that snapshot.
 */
export const coverageViewSchema = z.object({
  findings: z.array(coverageFindingSchema),
  review: coverageReviewViewSchema.nullable(),
  reviewedSnapshotId: z.uuid().nullable(),
  current: z.boolean(),
});
export type CoverageView = z.infer<typeof coverageViewSchema>;

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
  // Marked applied with this snapshot (tracker spec): shows as "sent".
  sentAt: z.date().nullable(),
});
export type SnapshotSummary = z.infer<typeof snapshotSummarySchema>;

export const versionViewSchema = z.object({
  id: z.uuid(),
  language: outputLanguageSchema,
  label: z.string().nullable(),
  snapshot: snapshotSummarySchema,
  snapshotCount: z.number().int(),
  // The snapshot sent with the application, when it was marked applied
  // (workspace spec: the Documents block shows which one was sent).
  sent: z.object({ snapshotId: z.uuid(), sentAt: z.date() }).nullable(),
  content: documentContentSchema,
  pages: z.number(),
  // The page limit of the settings the document was written with.
  maxPages: z.number().int(),
  pdf: z.object({
    // Rendered from the official snapshot; `pages` is then measured.
    ready: z.boolean(),
    rendering: z.boolean(),
    // The suggested name, which the user can edit before downloading.
    fileName: z.string(),
  }),
  atsCheck: atsCheckSchema.nullable(),
  // After its latest generation from the profile (resume spec, "Generation
  // rules"): up to five lines saying what the document emphasizes and
  // leaves in the background, or, for an adjustment, what changed from the
  // version it started from.
  emphasis: z
    .object({ lines: z.array(z.string()), adjusted: z.boolean() })
    .nullable(),
  trace: z.array(evidenceTraceSchema),
  instructionTrace: z.array(
    z.object({ instructionId: z.uuid(), text: z.string() })
  ),
  // A resume's or a cover letter's coverage review.
  coverage: coverageViewSchema.nullable(),
  // Keys of the findings the user ignored in this version
  // (`coverageFindingKey`, `reviewNoteKey`): findings and review notes.
  dismissedFindings: z.array(z.string()),
  // The profile version the official snapshot froze, and the published
  // one when it is newer (resume spec, "Document workspace": "Use version
  // N" moves the version to it).
  profile: z.object({
    versionNumber: z.number().int().nullable(),
    newer: z
      .object({ profileVersionId: z.uuid(), number: z.number().int() })
      .nullable(),
  }),
  // Lines "not in your profile" the user added to the profile: the
  // suggestion waits in the draft or was accepted there (and the document
  // still reads an older version).
  sentToProfile: z.array(
    z.object({
      lineId: z.string(),
      profileSuggestionId: z.uuid(),
      status: z.enum(["pending", "accepted"]),
    })
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
  // A cover letter's sources besides profile lines and instructions, for
  // its trace.
  letterTrace: z
    .object({
      companyFacts: z.array(
        z.object({ id: z.uuid(), text: z.string(), sourceUrl: z.string() })
      ),
      motivationPoints: z.array(z.object({ id: z.uuid(), text: z.string() })),
    })
    .nullable(),
  // A cover letter and its resume (resume spec, "Cover letter and its
  // resume"): outdated once that resume version got a new snapshot.
  letter: z
    .object({
      resumeVersionId: z.uuid().nullable(),
      outdated: z.boolean(),
      motivationSkipped: z.boolean(),
    })
    .nullable(),
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
  tone: toneSchema,
  // An adjustment of an existing version (the method's prompt 04b).
  adjusted: z.boolean(),
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
