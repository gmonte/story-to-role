import { and, desc, eq, isNotNull, isNull, max } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import { positionAccountVersionsTable } from "../db/career-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class AccountsRepository {
  constructor(private readonly tx: DbClient) {}

  /** A position's versions, newest first. */
  listVersions(positionId: string) {
    return this.tx
      .select()
      .from(positionAccountVersionsTable)
      .where(eq(positionAccountVersionsTable.positionId, positionId))
      .orderBy(desc(positionAccountVersionsTable.createdAt));
  }

  async findVersion(input: { profileId: string; accountVersionId: string }) {
    const [row] = await this.tx
      .select()
      .from(positionAccountVersionsTable)
      .where(
        and(
          eq(positionAccountVersionsTable.profileId, input.profileId),
          eq(positionAccountVersionsTable.id, input.accountVersionId)
        )
      );
    return row;
  }

  /** The position's draft: its one unapproved version, if any. */
  async findDraft(positionId: string) {
    const [row] = await this.tx
      .select()
      .from(positionAccountVersionsTable)
      .where(
        and(
          eq(positionAccountVersionsTable.positionId, positionId),
          isNull(positionAccountVersionsTable.approvedAt)
        )
      );
    return row;
  }

  async lastVersionNumber(positionId: string) {
    const [row] = await this.tx
      .select({ version: max(positionAccountVersionsTable.version) })
      .from(positionAccountVersionsTable)
      .where(
        and(
          eq(positionAccountVersionsTable.positionId, positionId),
          isNotNull(positionAccountVersionsTable.approvedAt)
        )
      );
    return row?.version ?? 0;
  }

  async insertVersion(version: Insert<typeof positionAccountVersionsTable>) {
    const [row] = await this.tx
      .insert(positionAccountVersionsTable)
      .values(version)
      .returning();
    return row;
  }

  async updateVersion(
    accountVersionId: string,
    changes: Partial<Insert<typeof positionAccountVersionsTable>>
  ) {
    await this.tx
      .update(positionAccountVersionsTable)
      .set(changes)
      .where(eq(positionAccountVersionsTable.id, accountVersionId));
  }

  async deleteVersion(accountVersionId: string) {
    await this.tx
      .delete(positionAccountVersionsTable)
      .where(eq(positionAccountVersionsTable.id, accountVersionId));
  }
}
