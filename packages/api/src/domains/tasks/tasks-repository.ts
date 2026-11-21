import { and, desc, eq, gt, inArray, like } from "drizzle-orm";

import type { AiFunding } from "@repo/api/domains/ai/ai-funding";
import type { DbClient } from "@repo/api/tools/db-client";
import {
  documentsTable,
  generationsTable,
} from "@repo/api/domains/documents/db/documents-tables";
import type {
  DocumentKind,
  GenerationKind,
} from "@repo/api/domains/documents/schemas/document";

import { tasksTable } from "./db/tasks-tables";
import type { Task, TaskProgress, TaskType } from "./schemas/task";

const taskColumns = {
  id: tasksTable.id,
  type: tasksTable.type,
  status: tasksTable.status,
  runId: tasksTable.runId,
  progress: tasksTable.progress,
  errorMessage: tasksTable.errorMessage,
  createdAt: tasksTable.createdAt,
  finishedAt: tasksTable.finishedAt,
};

export class TasksRepository {
  constructor(private readonly tx: DbClient) {}

  async create(input: {
    userId: string;
    type: TaskType;
    subjectId?: string;
    funding?: AiFunding;
    reviewers?: number;
    documentKind?: DocumentKind;
    generationKind?: GenerationKind;
  }): Promise<Task> {
    const [task] = await this.tx
      .insert(tasksTable)
      .values(input)
      .returning(taskColumns);
    return task;
  }

  /** The kinds of a generation and of its document, to keep on its task. */
  async generationKinds(generationId: string) {
    const [row] = await this.tx
      .select({
        documentKind: documentsTable.kind,
        generationKind: generationsTable.kind,
      })
      .from(generationsTable)
      .innerJoin(
        documentsTable,
        eq(documentsTable.id, generationsTable.documentId)
      )
      .where(eq(generationsTable.id, generationId));
    return row ?? null;
  }

  /** The runs still going for the user: what deleting the account stops. */
  async activeRunIds(userId: string) {
    const rows = await this.tx
      .select({ runId: tasksTable.runId })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.userId, userId),
          inArray(tasksTable.status, ["pending", "processing"])
        )
      );
    return rows.flatMap((row) => (row.runId ? [row.runId] : []));
  }

  /** The user's latest task their key stopped (out of credit, refused). */
  async lastStoppedByKey(userId: string) {
    const [row] = await this.tx
      .select({ type: tasksTable.type, createdAt: tasksTable.createdAt })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.userId, userId),
          like(tasksTable.errorMessage, "key\\_%")
        )
      )
      .orderBy(desc(tasksTable.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** For the worker, which acts for whoever created the task. */
  async findOwner(taskId: string) {
    const [row] = await this.tx
      .select({
        userId: tasksTable.userId,
        type: tasksTable.type,
        subjectId: tasksTable.subjectId,
        funding: tasksTable.funding,
        reviewers: tasksTable.reviewers,
      })
      .from(tasksTable)
      .where(eq(tasksTable.id, taskId));
    return row;
  }

  async setRunId(input: { taskId: string; runId: string }) {
    await this.tx
      .update(tasksTable)
      .set({ runId: input.runId })
      .where(eq(tasksTable.id, input.taskId));
  }

  async markProcessing(taskId: string) {
    await this.tx
      .update(tasksTable)
      .set({ status: "processing", startedAt: new Date() })
      .where(eq(tasksTable.id, taskId));
  }

  async updateProgress(input: { taskId: string; progress: TaskProgress }) {
    await this.tx
      .update(tasksTable)
      .set({ progress: input.progress })
      .where(eq(tasksTable.id, input.taskId));
  }

  async markCompleted(taskId: string) {
    await this.tx
      .update(tasksTable)
      .set({ status: "completed", finishedAt: new Date() })
      .where(eq(tasksTable.id, taskId));
  }

  async markFailed(input: { taskId: string; errorMessage: string }) {
    await this.tx
      .update(tasksTable)
      .set({
        status: "failed",
        finishedAt: new Date(),
        errorMessage: input.errorMessage,
      })
      .where(eq(tasksTable.id, input.taskId));
  }
  /**
   * A task of this type still pending or running for a subject. One older
   * than `staleAfterMs` counts as dead (a worker that crashed never marks
   * its task), so a new one may start.
   */
  /** The live progress of the latest task of `type` on a row. */
  async latestProgress(subjectId: string, type: TaskType) {
    const [row] = await this.tx
      .select({ progress: tasksTable.progress })
      .from(tasksTable)
      .where(
        and(eq(tasksTable.subjectId, subjectId), eq(tasksTable.type, type))
      )
      .orderBy(desc(tasksTable.createdAt))
      .limit(1);
    return row?.progress ?? null;
  }

  async activeTask(subjectId: string, type: TaskType, staleAfterMs = 300_000) {
    const [row] = await this.tx
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.subjectId, subjectId),
          eq(tasksTable.type, type),
          inArray(tasksTable.status, ["pending", "processing"]),
          gt(tasksTable.createdAt, new Date(Date.now() - staleAfterMs))
        )
      )
      .limit(1);
    return row ?? null;
  }
}
