import { z } from "zod";

import {
  documentKindSchema,
  generationKindSchema,
} from "@repo/api/domains/documents/schemas/document";
import { taskTypeSchema } from "@repo/api/domains/tasks/schemas/task";
import { createPaginationOutputSchema } from "@repo/api/utils/schemas/pagination";

/**
 * Who paid for an operation (billing spec, "Usage statement"): the user's
 * credits, their own key, or StoryToRole without charging them.
 */
export const usagePayerSchema = z.enum(["credits", "key", "storytorole"]);
export type UsagePayer = z.infer<typeof usagePayerSchema>;

/**
 * What an operation was: its task's type and, for a document, the kind of
 * document and generation; a call outside any task by its purpose.
 */
export const usageOperationSchema = z.object({
  taskType: taskTypeSchema.nullable(),
  documentKind: documentKindSchema.nullable(),
  generationKind: generationKindSchema.nullable(),
  purpose: z.string().nullable(),
});
export type UsageOperation = z.infer<typeof usageOperationSchema>;

const tokensShape = {
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cacheReadTokens: z.number().int(),
  cacheWriteTokens: z.number().int(),
};

export const usageStatementSchema = z.object({
  window: z.object({ from: z.date(), to: z.date() }),
  // The deployment shows what StoryToRole paid and US$ beyond the user's key.
  showsPlatformCost: z.boolean(),
  totals: z.array(
    z.object({
      payer: usagePayerSchema,
      operations: z.number().int(),
      ...tokensShape,
      // Debited for the user's credits, the credit equivalent otherwise.
      credits: z.number(),
      usd: z.number().nullable(),
    })
  ),
  // Completed operations of each kind: failed ones stay out of averages.
  summary: z.array(
    z.object({
      operation: usageOperationSchema,
      count: z.number().int(),
      averageCredits: z.number(),
      averageTokens: z.number(),
      averageUsd: z.number().nullable(),
      totalCredits: z.number(),
    })
  ),
});
export type UsageStatement = z.infer<typeof usageStatementSchema>;

/**
 * The usage statement over every user, for the admin: the platform's cost
 * always shows, and each model's average use per operation that ran it.
 */
export const platformUsageSchema = usageStatementSchema.extend({
  models: z.array(
    z.object({
      model: z.string(),
      // Completed operations that called it.
      operations: z.number().int(),
      averageInputTokens: z.number(),
      averageOutputTokens: z.number(),
      averageCredits: z.number(),
      averageUsd: z.number(),
      totalUsd: z.number(),
    })
  ),
});
export type PlatformUsage = z.infer<typeof platformUsageSchema>;

/** One operation of the usage statement, with its calls split by model. */
export const usageOperationRowSchema = z.object({
  operationId: z.string(),
  operation: usageOperationSchema,
  at: z.date(),
  status: z.enum(["completed", "failed"]),
  payer: usagePayerSchema,
  ...tokensShape,
  credits: z.number(),
  usd: z.number().nullable(),
  // The operation's credits shared by each model's part of its cost.
  models: z.array(
    z.object({
      model: z.string(),
      ...tokensShape,
      credits: z.number(),
      usd: z.number().nullable(),
    })
  ),
});
export type UsageOperationRow = z.infer<typeof usageOperationRowSchema>;

export const usageOperationsSchema = createPaginationOutputSchema({
  dataSchema: usageOperationRowSchema,
});
export type UsageOperations = z.infer<typeof usageOperationsSchema>;
