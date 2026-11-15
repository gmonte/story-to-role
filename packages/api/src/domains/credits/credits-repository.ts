import { and, desc, eq, gt, isNull, like, or, sql } from "drizzle-orm";

import { documentsTable } from "@repo/api/domains/documents/db/documents-tables";
import { usersTable } from "@repo/api/domains/users/db/users-tables";
import type { DbClient } from "@repo/api/tools/db-client";

import {
  courtesyGrantsTable,
  creditEntriesTable,
  creditLotsTable,
} from "./db/credits-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class CreditsRepository {
  constructor(private readonly tx: DbClient) {}

  /** Holds the user's row: reservations and settlements run one at a time. */
  async lockUser(userId: string) {
    await this.tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .for("update");
  }

  /** Inserts a lot unless its origin exists; returns it when new. */
  async insertLot(lot: Insert<typeof creditLotsTable>) {
    const [row] = await this.tx
      .insert(creditLotsTable)
      .values(lot)
      .onConflictDoNothing({ target: creditLotsTable.origin })
      .returning();
    return row ?? null;
  }

  async insertEntries(rows: Array<Insert<typeof creditEntriesTable>>) {
    if (rows.length === 0) return;
    await this.tx.insert(creditEntriesTable).values(rows);
  }

  /**
   * Lots not yet expired, each with what is left of it: the user's, or
   * those whose origin matches a pattern.
   */
  liveLots(userId: string | undefined, now: Date, originLike?: string) {
    return this.tx
      .select({
        lot: creditLotsTable,
        remaining: sql<number>`coalesce(sum(${creditEntriesTable.amount}), 0)::int`,
      })
      .from(creditLotsTable)
      .leftJoin(
        creditEntriesTable,
        eq(creditEntriesTable.lotId, creditLotsTable.id)
      )
      .where(
        and(
          userId ? eq(creditLotsTable.userId, userId) : undefined,
          originLike ? like(creditLotsTable.origin, originLike) : undefined,
          or(
            isNull(creditLotsTable.expiresAt),
            gt(creditLotsTable.expiresAt, now)
          )
        )
      )
      .groupBy(creditLotsTable.id);
  }

  /** A task's entries, to settle or release its reservation. */
  taskEntries(taskId: string) {
    return this.tx
      .select()
      .from(creditEntriesTable)
      .where(eq(creditEntriesTable.taskId, taskId));
  }

  /** Outstanding reservations of the user: reserved minus released. */
  async reserved(userId: string) {
    const [row] = await this.tx
      .select({
        total: sql<number>`coalesce(sum(case when ${creditEntriesTable.kind} = 'reserve' then -${creditEntriesTable.amount} when ${creditEntriesTable.kind} = 'release' then -${creditEntriesTable.amount} else 0 end), 0)::int`,
      })
      .from(creditEntriesTable)
      .where(eq(creditEntriesTable.userId, userId));
    return row?.total ?? 0;
  }

  activeCourtesy(userId: string, now: Date) {
    return this.tx
      .select()
      .from(courtesyGrantsTable)
      .where(
        and(
          eq(courtesyGrantsTable.userId, userId),
          isNull(courtesyGrantsTable.endedAt),
          or(
            isNull(courtesyGrantsTable.endsAt),
            gt(courtesyGrantsTable.endsAt, now)
          )
        )
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  /** Every courtesy grant, newest first, with whom it was granted to. */
  listCourtesyGrants() {
    return this.tx
      .select({
        id: courtesyGrantsTable.id,
        email: usersTable.email,
        fullName: usersTable.fullName,
        monthlyCredits: courtesyGrantsTable.monthlyCredits,
        endsAt: courtesyGrantsTable.endsAt,
        endedAt: courtesyGrantsTable.endedAt,
        createdAt: courtesyGrantsTable.createdAt,
      })
      .from(courtesyGrantsTable)
      .innerJoin(usersTable, eq(usersTable.id, courtesyGrantsTable.userId))
      .orderBy(desc(courtesyGrantsTable.createdAt));
  }

  findCourtesyGrant(courtesyGrantId: string) {
    return this.tx
      .select()
      .from(courtesyGrantsTable)
      .where(eq(courtesyGrantsTable.id, courtesyGrantId))
      .then((rows) => rows[0] ?? null);
  }

  /** The lots granted by one courtesy grant (one per month). */
  courtesyLots(courtesyGrantId: string, now: Date) {
    return this.liveLots(undefined, now, `courtesy:${courtesyGrantId}:%`);
  }

  findActiveUserByEmail(email: string) {
    return this.tx
      .select()
      .from(usersTable)
      .where(
        and(
          sql`lower(${usersTable.email}) = ${email.trim().toLowerCase()}`,
          isNull(usersTable.deletedAt)
        )
      )
      .then((rows) => rows[0] ?? null);
  }

  /** Every active user's id, for reconciliation. */
  listActiveUserIds() {
    return this.tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(isNull(usersTable.deletedAt));
  }

  /** Whether a profile has any resume yet (the Free plan's credit reserve). */
  async hasResume(profileId: string) {
    const [row] = await this.tx
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.profileId, profileId),
          eq(documentsTable.kind, "resume")
        )
      )
      .limit(1);
    return !!row;
  }

  async insertCourtesyGrant(row: Insert<typeof courtesyGrantsTable>) {
    const [inserted] = await this.tx
      .insert(courtesyGrantsTable)
      .values(row)
      .returning();
    return inserted;
  }

  async endCourtesyGrant(grantId: string, endedAt: Date) {
    await this.tx
      .update(courtesyGrantsTable)
      .set({ endedAt })
      .where(eq(courtesyGrantsTable.id, grantId));
  }
}
