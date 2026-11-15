import { and, eq, gt, inArray } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

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
  }): Promise<Task> {
    const [task] = await this.tx
      .insert(tasksTable)
      .values(input)
      .returning(taskColumns);
    return task;
  }

  /** For the worker, which acts for whoever created the task. */
  async findOwner(taskId: string) {
    const [row] = await this.tx
      .select({
        userId: tasksTable.userId,
        type: tasksTable.type,
        subjectId: tasksTable.subjectId,
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
