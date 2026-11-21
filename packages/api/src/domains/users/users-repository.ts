import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import { usersTable } from "./db/users-tables";

export class UsersRepository {
  constructor(private readonly tx: DbClient) {}

  /** The local user behind a Clerk session, unless the account was deleted. */
  async findActiveByClerkUserId(clerkUserId: string) {
    const [user] = await this.tx
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.clerkUserId, clerkUserId),
          isNull(usersTable.deletedAt)
        )
      );
    return user;
  }

  /**
   * A keyset page of the accounts not deleted, newest first, matching
   * `search` in the name or email (the admin's list). The cursor is the
   * last row's creation time (as Postgres text, to keep its microseconds)
   * and id.
   */
  page(input: {
    search?: string;
    cursor: { createdAt: string; userId: string } | null;
    limit: number;
  }) {
    return this.tx
      .select({
        userId: usersTable.id,
        email: usersTable.email,
        name: usersTable.fullName,
        createdAt: usersTable.createdAt,
        createdAtText: sql<string>`${usersTable.createdAt}::text`,
      })
      .from(usersTable)
      .where(
        and(
          this.matching(input.search),
          input.cursor
            ? sql`(${usersTable.createdAt} < ${input.cursor.createdAt}::timestamptz or (${usersTable.createdAt} = ${input.cursor.createdAt}::timestamptz and ${usersTable.id} < ${input.cursor.userId}::uuid))`
            : undefined
        )
      )
      .orderBy(desc(usersTable.createdAt), desc(usersTable.id))
      .limit(input.limit);
  }

  /** How many accounts `page` pages through. */
  async count(search?: string) {
    const [row] = await this.tx
      .select({ total: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(this.matching(search));
    return row?.total ?? 0;
  }

  private matching(search?: string): SQL | undefined {
    const term = search?.trim();
    // `%` and `_` typed in the search are taken literally.
    const pattern = term
      ? `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
      : null;
    return and(
      isNull(usersTable.deletedAt),
      pattern
        ? or(
            ilike(usersTable.email, pattern),
            ilike(usersTable.fullName, pattern)
          )
        : undefined
    );
  }

  async findById(userId: string) {
    const [user] = await this.tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    return user ?? null;
  }
}
