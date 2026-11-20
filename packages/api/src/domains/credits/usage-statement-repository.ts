import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { aiUsageTable } from "@repo/api/domains/ai/db/ai-tables";
import {
  documentsTable,
  generationsTable,
} from "@repo/api/domains/documents/db/documents-tables";
import { tasksTable } from "@repo/api/domains/tasks/db/tasks-tables";
import type { DbClient } from "@repo/api/tools/db-client";

import { creditEntriesTable } from "./db/credits-tables";

export class UsageStatementRepository {
  constructor(private readonly tx: DbClient) {}

  /**
   * The user's AI calls in a window, each with its task and, for a
   * document generation, the kinds of document and generation. A task with
   * any call in the window brings all its calls, so its operation stays
   * whole; which window it belongs to is decided by its last call.
   */
  callsBetween(userId: string, from: Date, to: Date) {
    const inWindow = alias(aiUsageTable, "in_window");
    const tasksInWindow = this.tx
      .selectDistinct({ taskId: inWindow.taskId })
      .from(inWindow)
      .where(
        and(
          eq(inWindow.userId, userId),
          gte(inWindow.createdAt, from),
          lt(inWindow.createdAt, to)
        )
      );
    return this.tx
      .select({
        callId: aiUsageTable.id,
        createdAt: aiUsageTable.createdAt,
        purpose: aiUsageTable.purpose,
        funding: aiUsageTable.funding,
        model: aiUsageTable.model,
        inputTokens: aiUsageTable.inputTokens,
        outputTokens: aiUsageTable.outputTokens,
        cacheReadTokens: aiUsageTable.cacheReadTokens,
        cacheWriteTokens: aiUsageTable.cacheWriteTokens,
        taskId: tasksTable.id,
        taskType: tasksTable.type,
        taskStatus: tasksTable.status,
        documentKind: documentsTable.kind,
        generationKind: generationsTable.kind,
      })
      .from(aiUsageTable)
      .leftJoin(tasksTable, eq(tasksTable.id, aiUsageTable.taskId))
      .leftJoin(generationsTable, eq(generationsTable.id, tasksTable.subjectId))
      .leftJoin(
        documentsTable,
        eq(documentsTable.id, generationsTable.documentId)
      )
      .where(
        and(
          eq(aiUsageTable.userId, userId),
          or(
            and(
              isNull(aiUsageTable.taskId),
              gte(aiUsageTable.createdAt, from),
              lt(aiUsageTable.createdAt, to)
            ),
            inArray(aiUsageTable.taskId, tasksInWindow)
          )
        )
      )
      .orderBy(aiUsageTable.createdAt);
  }

  /** What each task took from the user's credits: debits less refunds. */
  async debitedByTask(taskIds: string[]) {
    if (taskIds.length === 0) return new Map<string, number>();
    const rows = await this.tx
      .select({
        taskId: creditEntriesTable.taskId,
        debited: sql<number>`coalesce(-sum(${creditEntriesTable.amount}), 0)::int`,
      })
      .from(creditEntriesTable)
      .where(
        and(
          inArray(creditEntriesTable.taskId, taskIds),
          inArray(creditEntriesTable.kind, ["debit", "refund"])
        )
      )
      .groupBy(creditEntriesTable.taskId);
    return new Map(rows.map((row) => [row.taskId!, row.debited]));
  }
}
