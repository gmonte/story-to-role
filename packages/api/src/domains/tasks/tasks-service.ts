import { TRPCError } from "@trpc/server";

import { decideFunding } from "@repo/api/domains/credits/credit-funding";
import {
  assertFits,
  ensureMonthlyCredits,
  InsufficientCreditsError,
  lockedStoredCredits,
  reserveCredits,
  settleCredits,
  spendableTotal,
} from "@repo/api/domains/credits/credit-ledger";
import {
  type CapHints,
  creditCap,
  scopeOf,
} from "@repo/api/domains/credits/credit-pricing";
import { CreditsRepository } from "@repo/api/domains/credits/credits-repository";
import {
  creditReserve,
  keepsReserve,
} from "@repo/api/domains/credits/credit-reserve";
import type { DbClient } from "@repo/api/tools/db-client";
import { triggerClient } from "@repo/api/tools/trigger/trigger-client";

import { TasksRepository } from "./tasks-repository";
import type { RealtimeSubscription, Task, TaskType } from "./schemas/task";

// The message is translated where the error is formatted (tools/trpc).
const paymentRequired = (error: InsufficientCreditsError) =>
  new TRPCError({
    code: "PAYMENT_REQUIRED",
    message: error.message,
    cause: error,
  });

const asPaymentRequired = (error: unknown) => {
  throw error instanceof InsufficientCreditsError
    ? paymentRequired(error)
    : error;
};

/** What an action may not touch: the credit reserve, for the interview. */
const keptFor = (tx: DbClient, userId: string, type: TaskType, now: Date) =>
  keepsReserve(type) ? creditReserve(tx, userId, now) : Promise.resolve(0);

export class TasksService {
  constructor(
    private readonly db: DbClient,
    private readonly trigger: Pick<
      typeof triggerClient,
      "trigger"
    > = triggerClient
  ) {}

  /**
   * Whether the user can afford an action right now, checked before a
   * service creates the rows its task will work on; the reservation when
   * the task starts remains the guarantee.
   */
  async assertAffordable(input: {
    userId: string;
    type: TaskType;
    hints?: CapHints;
  }) {
    const cap = creditCap(input.type, input.hints);
    if (cap <= 0) return;
    const now = new Date();
    const scope = scopeOf(input.type);
    await this.db
      .transaction(async (tx) => {
        await ensureMonthlyCredits(tx, input.userId, now);
        const funding = await decideFunding(tx, {
          userId: input.userId,
          cap,
          scope,
          now,
        });
        // The user's key pays: credits don't limit them.
        if (funding === "key") return;
        assertFits({
          cap,
          available: await spendableTotal(tx, input.userId, scope, now),
          keep: await keptFor(tx, input.userId, input.type, now),
          stored: await lockedStoredCredits(tx, input.userId, scope, now),
        });
      })
      .catch(asPaymentRequired);
  }

  /**
   * Records the task and reserves what it may cost in one transaction
   * (billing spec, "Credit ledger"), then starts its run with only the row
   * id. A run that can't start leaves the row failed and its credits
   * released, never pending forever.
   */
  async start(input: {
    userId: string;
    type: TaskType;
    subjectId?: string;
    hints?: CapHints;
  }): Promise<{ task: Task; realtime: RealtimeSubscription }> {
    const now = new Date();
    const task = await this.db
      .transaction(async (tx) => {
        // The reserve is read under the lock that reserving holds.
        await new CreditsRepository(tx).lockUser(input.userId);
        const cap = creditCap(input.type, input.hints);
        const scope = scopeOf(input.type);
        const funding = await decideFunding(tx, {
          userId: input.userId,
          cap,
          scope,
          now,
        });
        const created = await new TasksRepository(tx).create({
          userId: input.userId,
          type: input.type,
          subjectId: input.subjectId,
          funding,
        });
        // A key-funded task reserves nothing: the user's key pays.
        if (funding === "credits") {
          await reserveCredits(tx, {
            userId: input.userId,
            taskId: created.id,
            cap,
            scope,
            keep: await keptFor(tx, input.userId, input.type, now),
          });
        }
        return created;
      })
      .catch(asPaymentRequired);

    const repository = new TasksRepository(this.db);
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
      await this.db.transaction((tx) =>
        settleCredits(tx, { userId: input.userId, taskId: task.id, actual: 0 })
      );
      throw error;
    }
  }

  /**
   * Starts a task for a row the caller just created (a generation, a
   * research run); when it can't start (not enough credits, the queue
   * down), `undo` marks that row failed so nothing waits on it forever.
   */
  async startOrUndo(
    input: Parameters<TasksService["start"]>[0],
    undo: () => Promise<void>
  ) {
    try {
      return await this.start(input);
    } catch (error) {
      await undo();
      throw error;
    }
  }
}
