import { clerkClient } from "@clerk/nextjs/server";

import { BillingService } from "@repo/api/domains/billing/billing-service";
import type { DbClient } from "@repo/api/tools/db-client";
import { getStorage, type Storage } from "@repo/api/tools/storage/storage";
import { logger } from "@repo/common/tools/logger";

import { buildAccountExport } from "./account-export";
import { AccountRepository } from "./account-repository";

const logTags = ["account"];

type Deps = {
  storage: Storage;
  billing: Pick<BillingService, "cancelForDeletion">;
  deleteClerkUser: (clerkUserId: string) => Promise<void>;
};

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
    };
  }

  export(userId: string) {
    return buildAccountExport({
      db: this.db,
      storage: this.deps.storage,
      userId,
    });
  }

  /**
   * Deletes the account from the app: then its Clerk user, which signs it
   * out everywhere. Stripe keeps only the invoices.
   */
  async deleteAccount(input: { userId: string; clerkUserId: string }) {
    await this.deleteData(input.userId);
    try {
      await this.deps.deleteClerkUser(input.clerkUserId);
    } catch (error) {
      // The data is gone already; a Clerk user left behind has no account
      // to open, and its own deletion (the webhook) finds nothing.
      logger.error(logTags, "Could not delete the Clerk user", { error });
    }
  }

  /**
   * Everything StoryToRole holds for the user: subscriptions cancelled,
   * stored files deleted, then the user's rows with their data key.
   */
  async deleteData(userId: string) {
    await this.deps.billing.cancelForDeletion(userId);
    const repository = new AccountRepository(this.db);
    for (const storageKey of await repository.storageKeys(userId)) {
      await this.deps.storage.delete(storageKey);
    }
    await repository.deleteUser(userId);
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
