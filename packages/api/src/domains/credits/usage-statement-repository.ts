import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { aiUsageTable } from "@repo/api/domains/ai/db/ai-tables";
import {
  documentsTable,
  generationsTable,
} from "@repo/api/domains/documents/db/documents-tables";
import type {
  DocumentKind,
  GenerationKind,
} from "@repo/api/domains/documents/schemas/document";
import { tasksTable } from "@repo/api/domains/tasks/db/tasks-tables";
import { usersTable } from "@repo/api/domains/users/db/users-tables";
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
  /** `userId` null takes every user's calls (the admin's statement). */
  callsBetween(userId: string | null, from: Date, to: Date) {
    const inWindow = alias(aiUsageTable, "in_window");
    const tasksInWindow = this.tx
      .selectDistinct({ taskId: inWindow.taskId })
      .from(inWindow)
      .where(
        and(
          userId ? eq(inWindow.userId, userId) : undefined,
          gte(inWindow.createdAt, from),
          lt(inWindow.createdAt, to)
        )
      );
    return this.calls(
      userId,
      or(
        and(
          isNull(aiUsageTable.taskId),
          gte(aiUsageTable.createdAt, from),
          lt(aiUsageTable.createdAt, to)
        ),
        inArray(aiUsageTable.taskId, tasksInWindow)
      )
    );
  }

  /** Every call of the given operations (task ids, or ids of loose calls). */
  callsOfOperations(userId: string, operationIds: string[]) {
    return this.calls(
      userId,
      or(
        inArray(aiUsageTable.taskId, operationIds),
        and(isNull(aiUsageTable.taskId), inArray(aiUsageTable.id, operationIds))
      )
    );
  }

  /**
   * A keyset page of the user's operations whose last call falls in the
   * window, newest first: one per finished task, one per loose call. The
   * cursor is the last row's call time (as Postgres text, to keep its
   * microseconds) and id. Unless the platform's cost is shown, operations
   * StoryToRole paid (no key, nothing debited) are left out.
   */
  operationsPage(input: {
    userId: string;
    from: Date;
    to: Date;
    showsPlatformCost: boolean;
    cursor: { lastCall: string; operationId: string } | null;
    limit: number;
  }) {
    const { operationId, grouped } = this.operations(input);
    return grouped
      .having(
        and(
          this.operationsHaving(input),
          input.cursor
            ? sql`(max(${aiUsageTable.createdAt}) < ${input.cursor.lastCall}::timestamptz or (max(${aiUsageTable.createdAt}) = ${input.cursor.lastCall}::timestamptz and ${operationId} < ${input.cursor.operationId}::uuid))`
            : undefined
        )
      )
      .orderBy(desc(sql`max(${aiUsageTable.createdAt})`), desc(operationId))
      .limit(input.limit);
  }

  /** How many operations `operationsPage` pages through. */
  async countOperations(input: {
    userId: string;
    from: Date;
    to: Date;
    showsPlatformCost: boolean;
  }) {
    const { grouped } = this.operations(input);
    const operations = grouped.having(this.operationsHaving(input)).as("ops");
    const [row] = await this.tx
      .select({ total: sql<number>`count(*)::int` })
      .from(operations);
    return row?.total ?? 0;
  }

  private operations(input: { userId: string }) {
    const operationId = sql<string>`coalesce(${aiUsageTable.taskId}, ${aiUsageTable.id})`;
    const lastCall = sql<string>`max(${aiUsageTable.createdAt})::text`;
    const grouped = this.tx
      .select({
        operationId: operationId.as("operation_id"),
        lastCall: lastCall.as("last_call"),
      })
      .from(aiUsageTable)
      .leftJoin(tasksTable, eq(tasksTable.id, aiUsageTable.taskId))
      .where(
        and(
          eq(aiUsageTable.userId, input.userId),
          // Running tasks are listed once they finish and settle.
          or(
            isNull(aiUsageTable.taskId),
            inArray(tasksTable.status, ["completed", "failed"])
          )
        )
      )
      .groupBy(aiUsageTable.taskId, operationId)
      .$dynamic();
    return { operationId, grouped };
  }

  private operationsHaving(input: {
    from: Date;
    to: Date;
    showsPlatformCost: boolean;
  }): SQL | undefined {
    const debited = sql`(select coalesce(-sum(${creditEntriesTable.amount}), 0) from ${creditEntriesTable} where ${creditEntriesTable.taskId} = ${aiUsageTable.taskId} and ${creditEntriesTable.kind} in ('debit', 'refund'))`;
    return and(
      sql`max(${aiUsageTable.createdAt}) >= ${input.from.toISOString()}::timestamptz`,
      sql`max(${aiUsageTable.createdAt}) < ${input.to.toISOString()}::timestamptz`,
      input.showsPlatformCost
        ? undefined
        : sql`(bool_or(${aiUsageTable.funding} = 'key') or ${debited} > 0)`
    );
  }

  /**
   * Calls with their task and, for a document generation, the kinds of
   * document and generation, oldest first.
   */
  /** Only the user's own calls (every user's with null), whatever else `where` asks. */
  private calls(userId: string | null, where: SQL | undefined) {
    return this.tx
      .select({
        callId: aiUsageTable.id,
        userId: aiUsageTable.userId,
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
        // The task keeps the kinds once the document is deleted.
        documentKind: sql<DocumentKind | null>`coalesce(${documentsTable.kind}, ${tasksTable.documentKind})`,
        generationKind: sql<GenerationKind | null>`coalesce(${generationsTable.kind}, ${tasksTable.generationKind})`,
      })
      .from(aiUsageTable)
      .leftJoin(tasksTable, eq(tasksTable.id, aiUsageTable.taskId))
      .leftJoin(generationsTable, eq(generationsTable.id, tasksTable.subjectId))
      .leftJoin(
        documentsTable,
        eq(documentsTable.id, generationsTable.documentId)
      )
      .where(and(userId ? eq(aiUsageTable.userId, userId) : undefined, where))
      .orderBy(aiUsageTable.createdAt);
  }

  /** The users' email and name, for the admin's statement. */
  async usersByIds(userIds: string[]) {
    if (userIds.length === 0) {
      return new Map<string, { email: string; name: string | null }>();
    }
    const rows = await this.tx
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.fullName,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, userIds));
    return new Map(
      rows.map((row) => [row.id, { email: row.email, name: row.name || null }])
    );
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
