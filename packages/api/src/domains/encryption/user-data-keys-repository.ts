import { eq } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";
import type { WrappedDataKey } from "@repo/api/tools/crypto/envelope";

import { userDataKeysTable } from "./db/encryption-tables";

export class UserDataKeysRepository {
  constructor(private readonly tx: DbClient) {}

  async findByUserId(userId: string): Promise<WrappedDataKey | undefined> {
    const [row] = await this.tx
      .select({
        wrappedKey: userDataKeysTable.wrappedKey,
        masterKeyVersion: userDataKeysTable.masterKeyVersion,
      })
      .from(userDataKeysTable)
      .where(eq(userDataKeysTable.userId, userId));

    return row;
  }

  /** Two concurrent first uses race here: the loser keeps the winner's key. */
  async insertIfMissing(userId: string, key: WrappedDataKey) {
    await this.tx
      .insert(userDataKeysTable)
      .values({ userId, ...key })
      .onConflictDoNothing({ target: userDataKeysTable.userId });
  }

  async deleteByUserId(userId: string) {
    await this.tx
      .delete(userDataKeysTable)
      .where(eq(userDataKeysTable.userId, userId));
  }
}
