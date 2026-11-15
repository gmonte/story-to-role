import { z } from "zod";

export const interviewStages = [
  "confirm",
  "context",
  "projects",
  "stories",
  "evidence",
  "boundaries",
] as const;
export const interviewStageSchema = z.enum(interviewStages);
export type InterviewStage = z.infer<typeof interviewStageSchema>;

export const sessionStatusSchema = z.enum(["open", "closed"]);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const turnRoleSchema = z.enum(["user", "assistant"]);
export type TurnRole = z.infer<typeof turnRoleSchema>;

/**
 * What a turn is besides plain text: the fixed reply to a blocked message,
 * a proposal card, or a checkpoint prompt.
 */
export const turnKindSchema = z.enum([
  "text",
  "off_topic",
  "blocked_override",
  "cooldown",
  "checkpoint",
]);
export type TurnKind = z.infer<typeof turnKindSchema>;

export const draftKindSchema = z.enum([
  "achievement",
  "responsibility",
  "metric",
  "tool",
  "award",
  "story",
  "skill",
]);
export type DraftKind = z.infer<typeof draftKindSchema>;

export const draftStatusSchema = z.enum(["draft", "approved", "discarded"]);
export type DraftStatus = z.infer<typeof draftStatusSchema>;
