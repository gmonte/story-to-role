import { z } from "zod";

export const taskTypes = [
  "sample",
  "analyze_opening",
  "generate_document",
  "extract_style_profile",
  "split_instructions",
  "adapt_document",
  "render_pdf",
  "research_company",
  "motivation_turn",
  "validate_profile",
  "embed_profile",
  "profile_agent_turn",
  "document_agent_turn",
  "import_document",
] as const;
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

/**
 * What a running task reports, live through Realtime (metadata on
 * Trigger.dev) and durably here: a step key the interface turns into words,
 * and counts. Never career content.
 */
export const taskProgressSchema = z.object({
  step: z.number().int().nonnegative(),
  totalSteps: z.number().int().positive(),
  label: z.string().optional(),
  counts: z.record(z.string(), z.number()).optional(),
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
