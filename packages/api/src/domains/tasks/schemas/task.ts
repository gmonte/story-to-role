import { z } from "zod";

export const taskTypes = ["sample", "chat_turn"] as const;
export const taskTypeSchema = z.enum(taskTypes);
export type TaskType = z.infer<typeof taskTypeSchema>;

export const taskStatuses = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;
export const taskStatusSchema = z.enum(taskStatuses);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/** What a running task reports, live through Realtime and durably here. */
export const taskProgressSchema = z.object({
  step: z.number().int().nonnegative(),
  totalSteps: z.number().int().positive(),
  label: z.string().optional(),
});
export type TaskProgress = z.infer<typeof taskProgressSchema>;

/** What the browser needs to follow one run live, and nothing more. */
export const realtimeSubscriptionSchema = z.object({
  runId: z.string(),
  accessToken: z.string(),
});
export type RealtimeSubscription = z.infer<typeof realtimeSubscriptionSchema>;

export const taskSchema = z.object({
  id: z.uuid(),
  type: taskTypeSchema,
  status: taskStatusSchema,
  runId: z.string().nullable(),
  progress: taskProgressSchema.nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.date(),
  finishedAt: z.date().nullable(),
});
export type Task = z.infer<typeof taskSchema>;
