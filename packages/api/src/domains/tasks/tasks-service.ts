import { TRPCError } from "@trpc/server";

import type { DbClient } from "@repo/api/tools/db-client";
import { triggerClient } from "@repo/api/tools/trigger/trigger-client";

import { TasksRepository } from "./tasks-repository";
import type { Task, TaskType } from "./schemas/task";

export class TasksService {
  constructor(
    private readonly db: DbClient,
    private readonly trigger: Pick<
      typeof triggerClient,
      "trigger" | "createRunReadToken"
    > = triggerClient
  ) {}

  /**
   * Records the task, then starts its run with only the row id. A run that
   * can't start leaves the row failed, never pending forever.
   */
  async start(input: { userId: string; type: TaskType }): Promise<{
    task: Task;
    realtime: { runId: string; accessToken: string };
  }> {
    const repository = new TasksRepository(this.db);
    const task = await repository.create(input);

    try {
      const { runId, accessToken } = await this.trigger.trigger(task.type, {
        taskId: task.id,
      });
      await repository.setRunId({ taskId: task.id, runId });
      return { task: { ...task, runId }, realtime: { runId, accessToken } };
    } catch (error) {
      await repository.markFailed({
        taskId: task.id,
        errorMessage: "The task could not be started",
      });
      throw error;
    }
  }

  async getForUser(input: { taskId: string; userId: string }): Promise<Task> {
    const task = await new TasksRepository(this.db).findForUser(input);
    if (!task) throw new TRPCError({ code: "NOT_FOUND" });
    return task;
  }

  /** Only the task's owner may follow its run. */
  async createRealtimeToken(input: { taskId: string; userId: string }) {
    const task = await this.getForUser(input);
    if (!task.runId) throw new TRPCError({ code: "PRECONDITION_FAILED" });

    return {
      runId: task.runId,
      accessToken: await this.trigger.createRunReadToken(task.runId),
    };
  }
}
