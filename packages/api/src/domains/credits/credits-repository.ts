import { and, desc, eq, gt, isNull, like, lt, or, sql } from "drizzle-orm";

import {
  documentsTable,
  generationsTable,
} from "@repo/api/domains/documents/db/documents-tables";
import { tasksTable } from "@repo/api/domains/tasks/db/tasks-tables";
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

  /** The user's lots not yet expired, each with what is left of it. */
  liveLots(userId: string, now: Date) {
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
          eq(creditLotsTable.userId, userId),
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
        active: sql<boolean>`${courtesyGrantsTable.endedAt} is null and (${courtesyGrantsTable.endsAt} is null or ${courtesyGrantsTable.endsAt} > now())`,
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

  async endCourtesyGrant(courtesyGrantId: string, endedAt: Date) {
    await this.tx
      .update(courtesyGrantsTable)
      .set({ endedAt })
      .where(eq(courtesyGrantsTable.id, courtesyGrantId));
  }

  /**
   * Ends now the lots whose origin starts with a prefix (a refunded pack
   * or invoice): their expiry changes, not their entries, so what a
   * running task releases onto them later stays unspendable.
   */
  async expireLotsByOrigin(userId: string, originPrefix: string, now: Date) {
    await this.tx
      .update(creditLotsTable)
      .set({ expiresAt: now })
      .where(
        and(
          eq(creditLotsTable.userId, userId),
          like(creditLotsTable.origin, `${originPrefix}%`),
          or(
            isNull(creditLotsTable.expiresAt),
            gt(creditLotsTable.expiresAt, now)
          )
        )
      );
  }

  /**
   * Ends a courtesy grant's lots now: a lot's expiry, not its entries,
   * changes, so a reservation released onto it later stays unspendable.
   */
  async expireCourtesyLots(courtesyGrantId: string, now: Date) {
    await this.tx
      .update(creditLotsTable)
      .set({ expiresAt: now })
      .where(
        and(
          like(creditLotsTable.origin, `courtesy:${courtesyGrantId}:%`),
          or(
            isNull(creditLotsTable.expiresAt),
            gt(creditLotsTable.expiresAt, now)
          )
        )
      );
  }

  /**
   * Reservations left open by runs that died without settling (killed,
   * crashed): their tasks finished, or started before `startedBefore`.
   */
  openReservations(startedBefore: Date) {
    return this.tx
      .selectDistinct({
        taskId: tasksTable.id,
        userId: tasksTable.userId,
        status: tasksTable.status,
      })
      .from(creditEntriesTable)
      .innerJoin(tasksTable, eq(tasksTable.id, creditEntriesTable.taskId))
      .where(
        and(
          eq(creditEntriesTable.kind, "reserve"),
          sql`not exists (select 1 from ${creditEntriesTable} r where r."taskId" = ${tasksTable.id} and r.kind = 'release')`,
          or(
            sql`${tasksTable.status} in ('completed', 'failed')`,
            lt(tasksTable.createdAt, startedBefore)
          )
        )
      );
  }

  /** The depth and level of the profile's last resume, its usual choices. */
  lastResumeChoices(profileId: string) {
    return this.tx
      .select({
        reviewDepth: generationsTable.reviewDepth,
        writingLevel: generationsTable.writingLevel,
      })
      .from(generationsTable)
      .innerJoin(
        documentsTable,
        eq(documentsTable.id, generationsTable.documentId)
      )
      .where(
        and(
          eq(generationsTable.profileId, profileId),
          eq(generationsTable.kind, "generate"),
          eq(documentsTable.kind, "resume")
        )
      )
      .orderBy(desc(generationsTable.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }
}
