import { z } from "zod";

/** A LinkedIn step's interview (resume spec, "LinkedIn", "Step by step"). */
export const linkedinInterviewStatusSchema = z.enum([
  "in_progress",
  "finished",
  "skipped",
  "failed",
]);
export type LinkedinInterviewStatus = z.infer<
  typeof linkedinInterviewStatusSchema
>;

/** A question, an answer, or the fixed reply to an off-topic answer. */
export const linkedinTurnRoleSchema = z.enum(["question", "answer", "steer"]);
export type LinkedinTurnRole = z.infer<typeof linkedinTurnRoleSchema>;

/**
 * A LinkedIn instruction: kept for the writer, removed by the user, or
 * sent to the profile as a suggestion (it stays kept for the writer).
 */
export const linkedinInstructionStatusSchema = z.enum(["kept", "removed"]);
export type LinkedinInstructionStatus = z.infer<
  typeof linkedinInstructionStatusSchema
>;

/**
 * The interviewer's turn: the points of the user's last answer, copied
 * from it and tied to what they are about, and the next question or the
 * end of the step's questions.
 */
export const linkedinTurnSchema = z.object({
  points: z
    .array(
      z.object({
        text: z.string(),
        position_id: z.string().nullable().catch(null),
        project_id: z.string().nullable().catch(null),
        credential_id: z.string().nullable().catch(null),
      })
    )
    .catch([]),
  done: z.boolean(),
  question: z.string().nullable(),
});
export type LinkedinTurnDraft = z.infer<typeof linkedinTurnSchema>;

export const linkedinInstructionViewSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  positionId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
  credentialId: z.uuid().nullable(),
});

export const linkedinInterviewViewSchema = z.object({
  interviewId: z.uuid().nullable(),
  status: linkedinInterviewStatusSchema.nullable(),
  // The interviewer is preparing the next question.
  thinking: z.boolean(),
  turns: z.array(z.object({ role: linkedinTurnRoleSchema, text: z.string() })),
  // What the user's answers in this step left for the writer.
  instructions: z.array(linkedinInstructionViewSchema),
});
export type LinkedinInterviewView = z.infer<typeof linkedinInterviewViewSchema>;
