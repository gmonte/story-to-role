import { and, eq } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import { applicationOverridesTable } from "../db/instructions-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class OverridesRepository {
  constructor(private readonly tx: DbClient) {}

  list(openingId: string) {
    return this.tx
      .select()
      .from(applicationOverridesTable)
      .where(eq(applicationOverridesTable.openingId, openingId));
  }

  async upsert(row: Insert<typeof applicationOverridesTable>) {
    await this.tx
      .insert(applicationOverridesTable)
      .values(row)
      .onConflictDoUpdate({
        target: [
          applicationOverridesTable.openingId,
          applicationOverridesTable.sensitiveItemId,
        ],
        set: {
          choice: row.choice,
          encryptedGeneralized: row.encryptedGeneralized,
        },
      });
  }

  async remove(input: { openingId: string; sensitiveItemId: string }) {
    await this.tx
      .delete(applicationOverridesTable)
      .where(
        and(
          eq(applicationOverridesTable.openingId, input.openingId),
          eq(applicationOverridesTable.sensitiveItemId, input.sensitiveItemId)
        )
      );
  }
}
