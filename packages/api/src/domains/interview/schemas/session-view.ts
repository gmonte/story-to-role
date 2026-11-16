import { z } from "zod";

import { interviewLanguageSchema } from "@repo/api/domains/career/schemas/career";
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
  // The same fact's passages in the user's other files.
  alsoQuotes: z.array(z.string()),
  fromDocument: z.boolean(),
  language: interviewLanguageSchema,
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
  // The user's edit of an extracted fact's text…
  text: z.string().trim().min(1).max(800).optional(),
  // …or of a story's fields: every item stays editable.
  story: z
    .object({
      problem: z.string().trim().min(1).max(800),
      action: z.string().trim().min(1).max(800),
      partners: z.string().trim().max(300).optional(),
      result: z.string().trim().min(1).max(800),
    })
    .optional(),
});
export type ExtractionDecision = z.infer<typeof extractionDecisionSchema>;

export const sensitiveItemViewSchema = z.object({
  id: z.uuid(),
  kind: sensitiveItemKindSchema,
  original: z.string(),
  // The passage it appears in, when known.
  context: z.string().nullable(),
  choice: sensitivityChoiceSchema.nullable(),
  generalized: z.string().nullable(),
  reviewed: z.boolean(),
});
