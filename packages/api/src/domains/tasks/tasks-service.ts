import { TRPCError } from "@trpc/server";

import type { AiFunding } from "@repo/api/domains/ai/ai-funding";
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
import {
  creditReserve,
  keepsReserve,
} from "@repo/api/domains/credits/credit-reserve";
import { CreditsRepository } from "@repo/api/domains/credits/credits-repository";
import type { DbClient } from "@repo/api/tools/db-client";
import { triggerClient } from "@repo/api/tools/trigger/trigger-client";

import { endSubject } from "./end-subject";
import { finishTask, TaskCrashedError, TaskStalledError } from "./run-task";
import { maxDurationOf, stallGraceMs } from "./task-durations";
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

/** What an action may not touch: the credit reserve, for profile work. */
const keptFor = (tx: DbClient, userId: string, type: TaskType, now: Date) =>
  keepsReserve(type) ? creditReserve(tx, userId, now) : Promise.resolve(0);

// A task never started is called dead this long after it was created.
const neverStartedMs = 60 * 60 * 1000;

// A task this long without news is checked with Trigger.dev for a crash.
const quietBeforeCheckMs = 10_000;

// Tasks that run one at a time per user (their task caps the key): an
// import compares with the suggestions the one before it left waiting.
const queuedPerUser: ReadonlySet<TaskType> = new Set<TaskType>([
  "import_document",
]);

export class TasksService {
  constructor(
    private readonly db: DbClient,
    private readonly trigger: Pick<
      typeof triggerClient,
      "trigger"
    > = triggerClient,
    private readonly hasRunFailed: (runId: string) => Promise<boolean> = (
      runId
    ) => triggerClient.hasRunFailed(runId)
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
        const keep = await keptFor(tx, input.userId, input.type, now);
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
        const keep = await keptFor(tx, input.userId, input.type, now);
        const funding = await decideFunding(tx, {
          userId: input.userId,
          cap,
          scope,
          now,
          keep,
        });
        const repository = new TasksRepository(tx);
        // A document operation keeps its kinds: deleting the document
        // deletes the generation the subject points to.
        const kinds =
          input.subjectId &&
          (input.type === "generate_document" ||
            input.type === "adapt_document")
            ? await repository.generationKinds(input.subjectId)
            : null;
        const created = await repository.create({
          userId: input.userId,
          type: input.type,
          subjectId: input.subjectId,
          documentKind: kinds?.documentKind,
          generationKind: kinds?.generationKind,
          funding,
          reviewers: input.hints?.reviewers,
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
   * Fails the tasks whose run died (a crash or a deploy never lets it mark
   * its task) or never started, and the rows they worked on, releasing
   * their reservations: nothing waits on them forever.
   */
  async failStalled(now = new Date()) {
    const repository = new TasksRepository(this.db);
    const rows = await repository.listUnfinished(
      new Date(now.getTime() - stallGraceMs)
    );
    for (const row of rows) {
      const deadline =
        row.status === "processing" && row.startedAt
          ? row.startedAt.getTime() +
            maxDurationOf(row.type) * 1000 +
            stallGraceMs
          : row.createdAt.getTime() + neverStartedMs;
      if (now.getTime() <= deadline) continue;
      await this.endDead(row, new TaskStalledError());
    }
  }

  /**
   * Fails the user's tasks whose run already ended without marking them
   * (a crash, such as running out of memory), and the rows they worked
   * on, so a page polling its work learns it now rather than at the
   * sweep. Only a task quiet for a while is asked about: a run reports
   * progress as it goes. Every query a page polls while work runs calls
   * it first.
   */
  async failCrashed(userId: string) {
    const quietSince = Date.now() - quietBeforeCheckMs;
    const rows = await new TasksRepository(this.db).unfinishedRuns(userId);
    for (const row of rows) {
      const lastSign = (row.updatedAt ?? row.createdAt).getTime();
      if (!row.runId || lastSign > quietSince) continue;
      // Trigger.dev unreachable: the sweep fails the task later.
      const crashed = await this.hasRunFailed(row.runId).catch(() => false);
      if (!crashed) continue;
      await this.endDead(row, new TaskCrashedError());
    }
  }

  /** Fails a task whose run died, and the row it worked on. */
  private async endDead(
    row: {
      id: string;
      userId: string;
      type: TaskType;
      subjectId: string | null;
      funding: AiFunding;
    },
    error: Error
  ) {
    await finishTask({
      db: this.db,
      taskId: row.id,
      userId: row.userId,
      funding: row.funding,
      error,
    });
    await endSubject(this.db, row);
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
