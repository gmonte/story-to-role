import { and, eq } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import { aiUsageTable } from "./db/ai-tables";

export class AiUsageRepository {
  constructor(private readonly tx: DbClient) {}

  async record(usage: typeof aiUsageTable.$inferInsert) {
    await this.tx.insert(aiUsageTable).values(usage);
  }

  /** A task's calls paid with StoryToRole's credits (not the user's key). */
  creditFundedUsage(taskId: string) {
    return this.tx
      .select({
        model: aiUsageTable.model,
        inputTokens: aiUsageTable.inputTokens,
        outputTokens: aiUsageTable.outputTokens,
        cacheReadTokens: aiUsageTable.cacheReadTokens,
        cacheWriteTokens: aiUsageTable.cacheWriteTokens,
      })
      .from(aiUsageTable)
      .where(
        and(
          eq(aiUsageTable.taskId, taskId),
          eq(aiUsageTable.funding, "credits")
        )
      );
  }
}
