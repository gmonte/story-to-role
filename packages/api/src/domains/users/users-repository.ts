import { and, eq, isNull } from "drizzle-orm";

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
}
