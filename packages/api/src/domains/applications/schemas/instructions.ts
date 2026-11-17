import { z } from "zod";

import {
  evidenceKindSchema,
  sensitiveItemKindSchema,
} from "@repo/api/domains/evidence/schemas/evidence";

/**
 * A point of the application instructions (resume spec, "Application
 * instructions"): a draft until the user confirms it, then kept in this
 * application only. A removed point stays as a row so its gap answer is
 * not split again.
 */
export const instructionPointStatusSchema = z.enum([
  "draft",
  "kept",
  "removed",
]);
export type InstructionPointStatus = z.infer<
  typeof instructionPointStatusSchema
>;

/** Written on the generation screen, or answered to a gap question. */
export const instructionSourceSchema = z.enum(["written", "gap_answer"]);
export type InstructionSource = z.infer<typeof instructionSourceSchema>;

export const instructionsStatusSchema = z.enum([
  "splitting",
  "split",
  "failed",
]);
export type InstructionsStatus = z.infer<typeof instructionsStatusSchema>;

/** The locked facts of a position a locked-fact override may replace. */
export const lockedFieldSchema = z.enum([
  "employer",
  "title",
  "start_date",
  "end_date",
]);
export type LockedField = z.infer<typeof lockedFieldSchema>;

/** The position field each locked field stands for. */
export const positionFieldOf = {
  employer: "employer",
  title: "title",
  start_date: "startDate",
  end_date: "endDate",
} as const satisfies Record<LockedField, string>;

export const flaggedSensitiveItemSchema = z.object({
  kind: sensitiveItemKindSchema,
  original: z.string(),
  suggestedGeneralization: z.string().nullable(),
});
export type FlaggedSensitiveItem = z.infer<typeof flaggedSensitiveItemSchema>;

/**
 * What the classification model returns: each point in the user's own
 * words, whether it looks like a new career fact, where it would belong,
 * the sensitive items it names and any change to a locked fact.
 */
export const instructionSplitSchema = z.object({
  points: z.array(
    z.object({
      // The gap answer's ref ("gap-1") when the point is one; null otherwise.
      gap_ref: z.string().nullable(),
      text: z.string(),
      looks_like_career_fact: z.boolean(),
      position_id: z.string().nullable(),
      credential_id: z.string().nullable(),
      evidence_kind: evidenceKindSchema.nullable(),
      sensitive_items: z.array(
        z.object({
          kind: sensitiveItemKindSchema,
          original: z.string(),
          suggested_generalization: z.string().nullable(),
        })
      ),
      locked_fact_change: z
        .object({
          position_id: z.string(),
          field: lockedFieldSchema,
          value: z.string(),
        })
        .nullable(),
    })
  ),
});
export type InstructionSplit = z.infer<typeof instructionSplitSchema>;

export const instructionPointViewSchema = z.object({
  id: z.uuid(),
  status: instructionPointStatusSchema,
  source: instructionSourceSchema,
  text: z.string(),
  suggestedPromotion: z.boolean(),
  positionId: z.uuid().nullable(),
  credentialId: z.uuid().nullable(),
  evidenceKind: evidenceKindSchema.nullable(),
  // Sent to the profile as a suggestion (it stays in this application too).
  sentToProfile: z.boolean(),
  sensitiveItems: z.array(flaggedSensitiveItemSchema),
});
export type InstructionPointView = z.infer<typeof instructionPointViewSchema>;

export const lockedFactOverrideViewSchema = z.object({
  id: z.uuid(),
  // The point that asked for it: a request about this application only.
  instructionPointId: z.uuid().nullable(),
  positionId: z.uuid(),
  employer: z.string(),
  field: lockedFieldSchema,
  // The position's own value, for "instead of".
  original: z.string().nullable(),
  value: z.string(),
  confirmed: z.boolean(),
});
export type LockedFactOverrideView = z.infer<
  typeof lockedFactOverrideViewSchema
>;

export const applicationInstructionsSchema = z.object({
  splitting: z.boolean(),
  failed: z.boolean(),
  points: z.array(instructionPointViewSchema),
  overrides: z.array(lockedFactOverrideViewSchema),
  // Answered gap questions not split yet: they join the next split.
  pendingGapAnswers: z.number().int(),
});
export type ApplicationInstructions = z.infer<
  typeof applicationInstructionsSchema
>;

/** A point sent to the profile: the suggestion waiting in its draft. */
export const instructionSendResultSchema = z.object({
  instructionPointId: z.uuid(),
  profileSuggestionId: z.uuid(),
});
export type InstructionSendResult = z.infer<typeof instructionSendResultSchema>;
