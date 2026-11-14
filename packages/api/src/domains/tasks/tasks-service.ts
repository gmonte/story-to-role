import type { DbClient } from "@repo/api/tools/db-client";
import { triggerClient } from "@repo/api/tools/trigger/trigger-client";

import { TasksRepository } from "./tasks-repository";
import type { RealtimeSubscription, Task, TaskType } from "./schemas/task";

export class TasksService {
  constructor(
    private readonly db: DbClient,
    private readonly trigger: Pick<
      typeof triggerClient,
      "trigger"
    > = triggerClient
  ) {}

  /**
   * Records the task, then starts its run with only the row id. A run that
   * can't start leaves the row failed, never pending forever.
   */
  async start(input: {
    userId: string;
    type: TaskType;
    subjectId?: string;
  }): Promise<{ task: Task; realtime: RealtimeSubscription }> {
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
}
