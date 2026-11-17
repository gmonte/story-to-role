import type { DbClient } from "@repo/api/tools/db-client";
import { triggerClient } from "@repo/api/tools/trigger/trigger-client";
import type { AiFunding } from "@repo/api/domains/ai/ai-funding";
import { AiKeysRepository } from "@repo/api/domains/ai/ai-keys-repository";
import { KeyUnusableError } from "@repo/api/domains/ai/providers/provider-package";
import { settleTask } from "@repo/api/domains/credits/settle-task";

import { TasksRepository } from "./tasks-repository";
import type { TaskProgress, TaskType } from "./schemas/task";

export type TaskContext = {
  taskId: string;
  /** The user the task acts for: whoever created it. */
  userId: string;
  /** The row the task works on, when it has one. */
  subjectId: string | null;
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
  // A handler may end without a charge (a file refused before any work
  // was done for the user): its reservation is released like a failure's.
  handler: (context: TaskContext) => Promise<void | { charge: false }>
) {
  const repository = new TasksRepository(db);
  const owner = await repository.findOwner(taskId);

  if (owner?.type !== type) {
    throw new Error(`Task ${taskId} is not a ${String(type)} task`);
  }

  await repository.markProcessing(taskId);

  let outcome: void | { charge: false };
  try {
    outcome = await handler({
      taskId,
      userId: owner.userId,
      subjectId: owner.subjectId,
      db,
      reportProgress: async (progress) => {
        triggerClient.reportProgress(progress);
        await repository.updateProgress({ taskId, progress });
      },
    });
  } catch (error) {
    await finishTask({
      db,
      taskId,
      userId: owner.userId,
      funding: owner.funding,
      error,
    });
    throw error;
  }
  await finishTask({
    db,
    taskId,
    userId: owner.userId,
    funding: owner.funding,
    charge: outcome?.charge,
  });
}

/**
 * Ends a task: marks it completed or failed and settles its credits. A
 * key-funded task that failed on the user's key marks the key, so the user
 * sees why; nothing is charged for a failure.
 */
export async function finishTask(input: {
  db: DbClient;
  taskId: string;
  userId: string;
  funding: AiFunding;
  error?: unknown;
  // False: the task ends completed, with nothing charged.
  charge?: boolean;
}) {
  const { db, taskId, userId } = input;
  const repository = new TasksRepository(db);
  if (input.error === undefined) {
    await repository.markCompleted(taskId);
    // A settlement error never turns a finished task into a failed, free
    // one; reconciliation settles what is left open.
    await settleTask(db, {
      userId,
      taskId,
      succeeded: input.charge !== false,
    });
    return;
  }
  const keyFailure =
    input.funding === "key" && input.error instanceof KeyUnusableError
      ? input.error.reason
      : null;
  if (keyFailure) {
    await new AiKeysRepository(db).setStatus(userId, keyFailure, new Date());
  }
  await repository.markFailed({
    taskId,
    errorMessage: keyFailure ? `key_${keyFailure}` : "The task failed",
  });
  // A failed task releases its reservation (billing spec).
  await settleTask(db, { userId, taskId, succeeded: false });
}
