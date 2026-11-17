import { and, eq } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import { sensitiveItemsTable } from "./db/evidence-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

/** Sensitive items: what is left of the old evidence base. */
export class EvidenceRepository {
  constructor(private readonly tx: DbClient) {}

  listSensitiveItems(profileId: string) {
    return this.tx
      .select()
      .from(sensitiveItemsTable)
      .where(eq(sensitiveItemsTable.profileId, profileId));
  }

  async findSensitiveItem(input: {
    profileId: string;
    sensitiveItemId: string;
  }) {
    const [row] = await this.tx
      .select()
      .from(sensitiveItemsTable)
      .where(
        and(
          eq(sensitiveItemsTable.id, input.sensitiveItemId),
          eq(sensitiveItemsTable.profileId, input.profileId)
        )
      );
    return row;
  }

  async insertSensitiveItems(rows: Array<Insert<typeof sensitiveItemsTable>>) {
    if (rows.length === 0) return;
    await this.tx.insert(sensitiveItemsTable).values(rows);
  }

  async updateSensitiveItem(
    sensitiveItemId: string,
    changes: Partial<Insert<typeof sensitiveItemsTable>>
  ) {
    await this.tx
      .update(sensitiveItemsTable)
      .set(changes)
      .where(eq(sensitiveItemsTable.id, sensitiveItemId));
  }
}
