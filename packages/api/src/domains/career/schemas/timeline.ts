import { z } from "zod";

import { depthLevels } from "../depth";
import {
  interviewLanguageSchema,
  conflictFieldSchema,
  credentialKindSchema,
  credentialStatusSchema,
  positionOriginSchema,
  positionStatusSchema,
  scriptKindSchema,
  sourceDocumentKindSchema,
  sourceDocumentStatusSchema,
  timelineProposalKindSchema,
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

export const positionConflictSchema = z.object({
  id: z.uuid(),
  field: conflictFieldSchema,
  options: z.array(z.string()),
});

export const depthSchema = z.object({
  level: z.enum(depthLevels).nullable(),
  done: z.boolean(),
  counts: z.object({
    evidence: z.number(),
    resultsWithNumbers: z.number(),
    stories: z.number(),
  }),
  nudge: z
    .object({
      kind: z.literal("achievements_without_number"),
      count: z.number(),
    })
    .nullable(),
});

export const positionViewSchema = z.object({
  id: z.uuid(),
  employer: z.string(),
  title: z.string(),
  location: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  status: positionStatusSchema,
  origin: positionOriginSchema,
  scriptKind: scriptKindSchema,
  conflicts: z.array(positionConflictSchema),
  depth: depthSchema,
  // Languages its evidence was told in.
  languages: z.array(interviewLanguageSchema),
  // Facts its interviewer extracted that wait for the user's review.
  draftsToReview: z.number(),
});
export type PositionView = z.infer<typeof positionViewSchema>;

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

export const credentialViewSchema = credentialInputSchema.extend({
  id: z.uuid(),
  institution: z.string().nullable(),
  level: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  approved: z.boolean(),
  // A credential's story counts in depth like a position's.
  depth: depthSchema,
});
export type CredentialView = z.infer<typeof credentialViewSchema>;

export const sourceDocumentViewSchema = z.object({
  id: z.uuid(),
  kind: sourceDocumentKindSchema,
  fileName: z.string(),
  status: sourceDocumentStatusSchema,
  rejectionReason: z.string().nullable(),
  createdAt: z.date(),
  // The career chat has something to say about this import, not said yet.
  reactionPending: z.boolean(),
});

/** Read-only: a PDF is shown as page images, anything else as plain text. */
export const documentPreviewSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pdf"), pageCount: z.number().int() }),
  z.object({ type: z.literal("text"), text: z.string() }),
]);
export type DocumentPreview = z.infer<typeof documentPreviewSchema>;

export const timelineProposalViewSchema = z.object({
  id: z.uuid(),
  kind: timelineProposalKindSchema,
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
});
export type TimelineProposalView = z.infer<typeof timelineProposalViewSchema>;

export const careerProfileViewSchema = z.object({
  interviewLanguage: interviewLanguageSchema,
  privacyNoticeAccepted: z.boolean(),
  // A change made outside the chat waits for the chat's word on it.
  careerUpdatePending: z.boolean(),
});

export const narrativeViewSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  themes: z.array(z.string()),
  approved: z.boolean(),
});

export const timelineSchema = z.object({
  profile: careerProfileViewSchema,
  positions: z.array(positionViewSchema),
  removedPositions: z.array(positionViewSchema),
  credentials: z.array(credentialViewSchema),
  documents: z.array(sourceDocumentViewSchema),
  proposals: z.array(timelineProposalViewSchema),
  narrative: narrativeViewSchema.nullable(),
  // Languages the whole career holds evidence in: badges show only for two.
  evidenceLanguages: z.array(interviewLanguageSchema),
});
export type Timeline = z.infer<typeof timelineSchema>;
