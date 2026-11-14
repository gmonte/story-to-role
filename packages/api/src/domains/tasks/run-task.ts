import { metadata } from "@trigger.dev/sdk";

import type { DbClient } from "@repo/api/tools/db-client";

import { TasksRepository } from "./tasks-repository";
import type { TaskProgress, TaskType } from "./schemas/task";

export type TaskContext = {
  taskId: string;
  /** The user the task acts for: whoever created it. */
  userId: string;
  db: DbClient;
  /** Live to the browser through Realtime, durable in the task row. */
  reportProgress: (progress: TaskProgress) => Promise<void>;
};

/**
 * The frame of every Trigger.dev task: load the row by id, track its status,
 * and record failures without their content (an error message from a
 * provider may quote the prompt, so only a fixed message is stored).
 */
export async function runTask(
  { db, taskId, type }: { db: DbClient; taskId: string; type: TaskType },
  handler: (context: TaskContext) => Promise<void>
) {
  const repository = new TasksRepository(db);
  const owner = await repository.findOwner(taskId);

  if (owner?.type !== type) {
    throw new Error(`Task ${taskId} is not a ${String(type)} task`);
  }

  await repository.markProcessing(taskId);

  try {
    await handler({
      taskId,
      userId: owner.userId,
      db,
      reportProgress: async (progress) => {
        metadata.set("progress", progress);
        await repository.updateProgress({ taskId, progress });
      },
    });
    await repository.markCompleted(taskId);
  } catch (error) {
    await repository.markFailed({ taskId, errorMessage: "The task failed" });
    throw error;
  }
}
