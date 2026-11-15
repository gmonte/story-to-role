import { z } from "zod";

import { careerLanguageSchema } from "@repo/api/domains/career/schemas/career";
import {
  sensitiveItemKindSchema,
  sensitivityChoiceSchema,
} from "@repo/api/domains/evidence/schemas/evidence";

import {
  draftKindSchema,
  interviewStageSchema,
  turnKindSchema,
  turnRoleSchema,
} from "./interview";

export const turnViewSchema = z.object({
  id: z.uuid(),
  role: turnRoleSchema,
  kind: turnKindSchema,
  content: z.string().nullable(),
  createdAt: z.date(),
});

/** A line of the approval screen: the extracted fact beside the user's words. */
export const draftViewSchema = z.object({
  id: z.uuid(),
  kind: draftKindSchema,
  text: z.string().nullable(),
  story: z
    .object({
      problem: z.string(),
      action: z.string(),
      partners: z.string().optional(),
      result: z.string(),
    })
    .nullable(),
  quote: z.string(),
  fromDocument: z.boolean(),
  language: careerLanguageSchema,
  lowDetail: z.boolean(),
});
export type DraftView = z.infer<typeof draftViewSchema>;

export const sessionViewSchema = z.object({
  id: z.uuid(),
  positionId: z.uuid().nullable(),
  credentialId: z.uuid().nullable(),
  status: z.enum(["open", "closed"]),
  stage: interviewStageSchema,
  scriptKind: z.enum(["full", "short"]),
  turns: z.array(turnViewSchema),
  drafts: z.array(draftViewSchema),
  flaggedSensitiveItems: z.array(
    z.object({
      kind: sensitiveItemKindSchema,
      original: z.string(),
      suggestedGeneralization: z.string().nullable(),
    })
  ),
  extractionProposed: z.boolean(),
  checkpoint: z.enum(["none", "suggested", "required"]),
});
export type SessionView = z.infer<typeof sessionViewSchema>;

export const extractionDecisionSchema = z.object({
  draftId: z.uuid(),
  approved: z.boolean(),
  // The user's edit of the extracted text (facts) or story fields.
  text: z.string().trim().min(1).max(800).optional(),
});
export type ExtractionDecision = z.infer<typeof extractionDecisionSchema>;

export const sensitiveItemViewSchema = z.object({
  id: z.uuid(),
  kind: sensitiveItemKindSchema,
  original: z.string(),
  choice: sensitivityChoiceSchema.nullable(),
  generalized: z.string().nullable(),
  reviewed: z.boolean(),
});
