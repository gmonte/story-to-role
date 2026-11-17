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

/**
 * What an action may not touch. Nothing since the interview went: the
 * profile agent (P3, docs/plan.md) will keep the credit reserve again.
 */
const keep = 0;

// Tasks that run one at a time per user (their task caps the key). None
// since importing was removed; P4 (docs/plan.md) re-adds importing.
const queuedPerUser: ReadonlySet<TaskType> = new Set<TaskType>();

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
          keep,
        });
        // The user's key pays: credits don't limit them.
        if (funding === "key") return;
        assertFits({
          cap,
          available: await spendableTotal(tx, input.userId, scope, now),
          keep,
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
    const task = await this.reserve(input);

    const repository = new TasksRepository(this.db);
    try {
      const payload = { taskId: task.id };
      const { runId, accessToken } = queuedPerUser.has(task.type)
        ? await this.trigger.trigger(task.type, payload, {
            concurrencyKey: input.userId,
          })
        : await this.trigger.trigger(task.type, payload);
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
   * The task row and its reservation, with funding decided, without a run:
   * for work that runs inside a run already going, such as a career chat
   * turn. `finishTask` settles it.
   */
  async reserve(input: {
    userId: string;
    type: TaskType;
    subjectId?: string;
    hints?: CapHints;
  }): Promise<Task> {
    const now = new Date();
    return this.db
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
          keep,
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
            keep,
          });
        }
        return created;
      })
      .catch(asPaymentRequired);
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
