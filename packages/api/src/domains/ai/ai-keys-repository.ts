import { and, eq } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import { aiKeysTable } from "./db/ai-tables";
import type { AiKeyStatus } from "./schemas/ai-keys";

export class AiKeysRepository {
  constructor(private readonly tx: DbClient) {}

  findByUserId(userId: string) {
    return this.tx
      .select()
      .from(aiKeysTable)
      .where(this.ofUser(userId))
      .then((rows) => rows[0] ?? null);
  }

  /** Saves the user's key, replacing the one they had. */
  async upsert(row: {
    userId: string;
    encryptedKey: string;
    lastCharacters: string;
    status: AiKeyStatus;
    now: Date;
  }) {
    const values = {
      userId: row.userId,
      encryptedKey: row.encryptedKey,
      lastCharacters: row.lastCharacters,
      provider: "anthropic" as const,
      status: row.status,
      statusChangedAt: row.status === "active" ? null : row.now,
    };
    await this.tx
      .insert(aiKeysTable)
      .values(values)
      .onConflictDoUpdate({
        target: [aiKeysTable.userId, aiKeysTable.provider],
        set: values,
      });
  }

  async setStatus(userId: string, status: AiKeyStatus, now: Date) {
    await this.tx
      .update(aiKeysTable)
      .set({ status, statusChangedAt: now })
      .where(this.ofUser(userId));
  }

  async delete(userId: string) {
    await this.tx.delete(aiKeysTable).where(this.ofUser(userId));
  }

  private ofUser(userId: string) {
    return and(
      eq(aiKeysTable.userId, userId),
      eq(aiKeysTable.provider, "anthropic")
    );
  }
}
