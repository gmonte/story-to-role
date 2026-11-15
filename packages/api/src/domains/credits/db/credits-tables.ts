import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { tasksTable } from "@repo/api/domains/tasks/db/tasks-tables";
import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { createTable } from "@repo/api/utils/db/create-table";

import type {
  CreditEntryKind,
  CreditScope,
  CreditSource,
} from "../schemas/credits";

const createdAt = (d: Parameters<Parameters<typeof createTable>[1]>[0]) =>
  d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull();

/**
 * One grant of credits (billing spec, "Credit ledger"): every grant points
 * to its origin, unique, so granting again (a webhook redelivered, the
 * reconciliation job) never duplicates it.
 */
export const creditLotsTable = createTable(
  "credit_lots",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: createdAt(d),
    userId: d
      .uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    source: d.text().$type<CreditSource>().notNull(),
    scope: d.text().$type<CreditScope>().notNull().default("any"),
    amount: d.integer().notNull(),
    // Null: never expires (welcome credits).
    expiresAt: d.timestamp({ withTimezone: true }),
    // "welcome:<userId>", "courtesy:<grantId>:2026-11", a Stripe event…
    origin: d.text().notNull(),
  }),
  (t) => [
    unique("credit_lots_origin_unique").on(t.origin),
    index("credit_lots_user_id_idx").on(t.userId),
  ]
);

/**
 * The append-only ledger: grants, reservations, releases, debits and
 * refunds, each against a lot. Nothing is ever updated or deleted.
 */
export const creditEntriesTable = createTable(
  "credit_entries",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: createdAt(d),
    userId: d
      .uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    lotId: d
      .uuid()
      .notNull()
      .references(() => creditLotsTable.id, { onDelete: "cascade" }),
    kind: d.text().$type<CreditEntryKind>().notNull(),
    // Signed: grants, releases and refunds add; reservations and debits subtract.
    amount: d.integer().notNull(),
    taskId: d.uuid().references(() => tasksTable.id, { onDelete: "set null" }),
  }),
  (t) => [
    index("credit_entries_user_id_idx").on(t.userId),
    index("credit_entries_lot_id_idx").on(t.lotId),
    index("credit_entries_task_id_idx").on(t.taskId),
  ]
);

/**
 * The paid plan granted by the owner without a subscription (billing spec,
 * "Courtesy plan"), from the admin page; it lives here, not in Stripe.
 */
export const courtesyGrantsTable = createTable(
  "courtesy_grants",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: createdAt(d),
    userId: d
      .uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // Courtesy credits each month (zero allowed).
    monthlyCredits: d.integer().notNull(),
    endsAt: d.timestamp({ withTimezone: true }),
    endedAt: d.timestamp({ withTimezone: true }),
    grantedBy: d
      .uuid()
      .references(() => usersTable.id, { onDelete: "set null" }),
  }),
  (t) => [index("courtesy_grants_user_id_idx").on(t.userId)]
);

/**
 * "Finish with credits" (billing spec, funding order): on a paid plan,
 * stored credits are spent only after the user confirms, never silently.
 * One confirmation lasts until the end of the month.
 */
export const storedCreditConfirmationsTable = createTable(
  "stored_credit_confirmations",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    confirmedAt: createdAt(d),
    userId: d
      .uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expiresAt: d.timestamp({ withTimezone: true }).notNull(),
  }),
  (t) => [unique("stored_credit_confirmations_user_id_unique").on(t.userId)]
);
