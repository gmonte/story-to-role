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
      .where(
        and(
          eq(aiKeysTable.userId, userId),
          eq(aiKeysTable.provider, "anthropic")
        )
      )
      .then((rows) => rows[0] ?? null);
  }

  /** Saves the user's key, replacing the one they had. */
  async upsert(row: {
    userId: string;
    encryptedKey: string;
    lastCharacters: string;
  }) {
    const values = {
      ...row,
      provider: "anthropic" as const,
      status: "active" as const,
      statusChangedAt: null,
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
      .where(eq(aiKeysTable.userId, userId));
  }

  async delete(userId: string) {
    await this.tx.delete(aiKeysTable).where(eq(aiKeysTable.userId, userId));
  }
}
