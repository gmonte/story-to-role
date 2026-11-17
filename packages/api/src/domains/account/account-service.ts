import { clerkClient } from "@clerk/nextjs/server";
import { TRPCError } from "@trpc/server";

import { BillingService } from "@repo/api/domains/billing/billing-service";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import type { DbClient } from "@repo/api/tools/db-client";
import { getStorage, type Storage } from "@repo/api/tools/storage/storage";
import { triggerClient } from "@repo/api/tools/trigger/trigger-client";
import { logger } from "@repo/common/tools/logger";

import { exportFileName, streamAccountExport } from "./account-export";
import { AccountRepository } from "./account-repository";

const logTags = ["account"];

type Deps = {
  storage: Storage;
  billing: Pick<BillingService, "removeForDeletion">;
  deleteClerkUser: (clerkUserId: string) => Promise<void>;
  cancelRun: (runId: string) => Promise<void>;
};

const sameEmail = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Export and deletion (privacy spec, "Export and deletion"): everything the
 * user has as one ZIP; deleting the account stops all use at once.
 */
export class AccountService {
  private readonly deps: Deps;

  constructor(
    private readonly db: DbClient,
    deps: Partial<Deps> = {}
  ) {
    this.deps = {
      storage: deps.storage ?? getStorage(),
      billing: deps.billing ?? new BillingService(db),
      deleteClerkUser:
        deps.deleteClerkUser ??
        (async (clerkUserId) => {
          await (await clerkClient()).users.deleteUser(clerkUserId);
        }),
      cancelRun: deps.cancelRun ?? ((runId) => triggerClient.cancel(runId)),
    };
  }

  async export(userId: string) {
    return {
      stream: await streamAccountExport({
        db: this.db,
        storage: this.deps.storage,
        userId,
      }),
      fileName: exportFileName(),
    };
  }

  /**
   * Deletes the account: the Clerk user first (a failure stops here, with
   * nothing deleted), then everything StoryToRole holds. Should that fail,
   * Clerk's own deletion webhook, retried until it succeeds, finishes it.
   */
  async deleteAccount(input: {
    userId: string;
    clerkUserId: string;
    email: string;
    confirmEmail: string;
  }) {
    if (!sameEmail(input.email, input.confirmEmail)) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }
    await this.deps.deleteClerkUser(input.clerkUserId);
    await this.deleteData(input.userId);
  }

  /**
   * Everything StoryToRole holds for the user: running tasks stopped,
   * subscriptions cancelled, checkouts expired and the Stripe customer
   * deleted, then the user's rows
   * with their data key (use stops here), then their stored files, which
   * that key protected.
   */
  async deleteData(userId: string) {
    const repository = new AccountRepository(this.db);
    const storageKeys = await repository.storageKeys(userId);
    for (const runId of await new TasksRepository(this.db).activeRunIds(
      userId
    )) {
      await this.deps.cancelRun(runId).catch((error: unknown) => {
        logger.warn(logTags, "Could not cancel a run", { runId, error });
      });
    }
    await this.deps.billing.removeForDeletion(userId);
    await repository.deleteUser(userId);
    for (const storageKey of storageKeys) {
      // Unreadable without the deleted key; removed for good measure.
      await this.deps.storage.delete(storageKey).catch((error: unknown) => {
        logger.warn(logTags, "Could not delete a stored file", { error });
      });
    }
    logger.info(logTags, "Account deleted", { userId });
  }

  /** Clerk deleted the user (from its own interface or ours). */
  async deleteByClerkUser(clerkUserId: string) {
    const user = await new AccountRepository(this.db).findUserByClerkId(
      clerkUserId
    );
    if (user) await this.deleteData(user.id);
  }
}
