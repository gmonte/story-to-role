import { z } from "zod";

import { sensitiveItemKindSchema } from "@repo/api/domains/evidence/schemas/evidence";

export const motivationStatusSchema = z.enum([
  "in_progress",
  "finished",
  "skipped",
  "failed",
]);
export type MotivationStatus = z.infer<typeof motivationStatusSchema>;

/** A question, an answer, or the fixed reply to an off-topic answer. */
export const motivationTurnRoleSchema = z.enum(["question", "answer", "steer"]);
export type MotivationTurnRole = z.infer<typeof motivationTurnRoleSchema>;

/**
 * Where a point of the answers goes (resume spec, "Motivation interview"):
 * about this company it stays in the application; about the user it may
 * become a suggestion for the profile's career direction; about the chosen
 * story it may become one for that story's experience.
 */
export const motivationPointKindSchema = z.enum([
  "company",
  "goal",
  "story_detail",
]);
export type MotivationPointKind = z.infer<typeof motivationPointKindSchema>;

export const motivationPointStatusSchema = z.enum([
  "draft",
  "kept",
  "promoted",
  "removed",
]);
export type MotivationPointStatus = z.infer<typeof motivationPointStatusSchema>;

/** The interviewer's next step: a question, or the end of the interview. */
export const motivationQuestionSchema = z.object({
  done: z.boolean(),
  question: z.string().nullable(),
  // Whether the question is about the chosen story's turning point or detail.
  about_story: z.boolean(),
});

export const motivationSplitSchema = z.object({
  points: z.array(
    z.object({
      text: z.string(),
      kind: motivationPointKindSchema,
      // A goal or story detail worth saving beyond this application.
      worth_saving: z.boolean(),
      sensitive_items: z.array(
        z.object({
          kind: sensitiveItemKindSchema,
          original: z.string(),
          suggested_generalization: z.string().nullable(),
        })
      ),
    })
  ),
});

export const motivationViewSchema = z.object({
  interviewId: z.uuid().nullable(),
  status: motivationStatusSchema.nullable(),
  // The interviewer is preparing the next question.
  thinking: z.boolean(),
  turns: z.array(
    z.object({ role: motivationTurnRoleSchema, text: z.string() })
  ),
  points: z.array(
    z.object({
      id: z.uuid(),
      kind: motivationPointKindSchema,
      text: z.string(),
      suggested: z.boolean(),
      status: motivationPointStatusSchema,
    })
  ),
});
export type MotivationView = z.infer<typeof motivationViewSchema>;

export const motivationDecisionSchema = z.object({
  motivationPointId: z.uuid(),
  save: z.boolean(),
});

/** A point sent to the profile: the suggestion waiting in its draft. */
export const motivationSendResultSchema = z.object({
  motivationPointId: z.uuid(),
  profileSuggestionId: z.uuid(),
});
export type MotivationSendResult = z.infer<typeof motivationSendResultSchema>;
