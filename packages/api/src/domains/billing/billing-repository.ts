import { and, desc, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import { billingCustomersTable, subscriptionsTable } from "./db/billing-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class BillingRepository {
  constructor(private readonly tx: DbClient) {}

  findCustomerByUserId(userId: string) {
    return this.tx
      .select()
      .from(billingCustomersTable)
      .where(eq(billingCustomersTable.userId, userId))
      .then((rows) => rows[0] ?? null);
  }

  findCustomerByStripeId(stripeCustomerId: string) {
    return this.tx
      .select()
      .from(billingCustomersTable)
      .where(eq(billingCustomersTable.stripeCustomerId, stripeCustomerId))
      .then((rows) => rows[0] ?? null);
  }

  /** Records the user's customer unless one exists; returns the one kept. */
  async insertCustomer(row: Insert<typeof billingCustomersTable>) {
    await this.tx
      .insert(billingCustomersTable)
      .values(row)
      .onConflictDoNothing({ target: billingCustomersTable.userId });
    return this.findCustomerByUserId(row.userId);
  }

  listCustomers() {
    return this.tx.select().from(billingCustomersTable);
  }

  /** The user's latest subscription (the one whose period ends last). */
  findSubscriptionByStripeId(stripeSubscriptionId: string) {
    return this.tx
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.stripeSubscriptionId, stripeSubscriptionId))
      .then((rows) => rows[0] ?? null);
  }

  /** The user's latest subscription, live or not; never a replaced one. */
  findSubscriptionByUserId(userId: string) {
    return this.tx
      .select()
      .from(subscriptionsTable)
      .where(
        and(
          eq(subscriptionsTable.userId, userId),
          isNull(subscriptionsTable.replacedAt)
        )
      )
      .orderBy(desc(subscriptionsTable.currentPeriodEnd))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  /**
   * The user's live subscription (billing spec, "Plans and AI funding"):
   * its period not yet over, give or take a few days for a renewal Stripe
   * hasn't reported yet. A replaced one no longer counts, even before
   * Stripe reports it cancelled.
   */
  findLiveSubscription(userId: string, now: Date) {
    const grace = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
    return this.tx
      .select()
      .from(subscriptionsTable)
      .where(
        and(
          eq(subscriptionsTable.userId, userId),
          inArray(subscriptionsTable.status, [
            "active",
            "trialing",
            "past_due",
            "unpaid",
          ]),
          gt(subscriptionsTable.currentPeriodEnd, grace),
          isNull(subscriptionsTable.replacedAt)
        )
      )
      .orderBy(desc(subscriptionsTable.currentPeriodEnd))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  /**
   * The credit subscription an own-key one replaced whose paid period
   * isn't over (billing spec, "Switching plans"): it keeps granting.
   */
  findCarryover(userId: string, now: Date) {
    return this.tx
      .select()
      .from(subscriptionsTable)
      .where(
        and(
          eq(subscriptionsTable.userId, userId),
          eq(subscriptionsTable.plan, "credits"),
          isNotNull(subscriptionsTable.replacedAt),
          gt(subscriptionsTable.paidPeriodEnd, now)
        )
      )
      .orderBy(desc(subscriptionsTable.paidPeriodEnd))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  /** Marks a credit subscription as replaced by the own-key one. */
  async markReplaced(stripeSubscriptionId: string, now: Date) {
    await this.tx
      .update(subscriptionsTable)
      .set({ replacedAt: now })
      .where(
        and(
          eq(subscriptionsTable.stripeSubscriptionId, stripeSubscriptionId),
          isNull(subscriptionsTable.replacedAt)
        )
      );
  }

  async upsertSubscription(
    row: Omit<
      Insert<typeof subscriptionsTable>,
      "paidInvoiceId" | "paidPeriodStart" | "paidPeriodEnd" | "replacedAt"
    >
  ) {
    await this.tx
      .insert(subscriptionsTable)
      .values(row)
      .onConflictDoUpdate({
        target: subscriptionsTable.stripeSubscriptionId,
        set: {
          plan: row.plan,
          status: row.status,
          interval: row.interval,
          currentPeriodStart: row.currentPeriodStart,
          currentPeriodEnd: row.currentPeriodEnd,
          cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        },
      });
  }

  /** Records a paid invoice unless a later one is already recorded. */
  async recordPaidInvoice(input: {
    stripeSubscriptionId: string;
    invoiceId: string;
    periodStart: Date;
    periodEnd: Date;
  }) {
    const [current] = await this.tx
      .select()
      .from(subscriptionsTable)
      .where(
        eq(subscriptionsTable.stripeSubscriptionId, input.stripeSubscriptionId)
      );
    // The same invoice again (perhaps refunded since) or an older one.
    if (!current || current.paidInvoiceId === input.invoiceId) return;
    if (current.paidPeriodEnd && current.paidPeriodEnd >= input.periodEnd) {
      return;
    }
    await this.tx
      .update(subscriptionsTable)
      .set({
        paidInvoiceId: input.invoiceId,
        paidPeriodStart: input.periodStart,
        paidPeriodEnd: input.periodEnd,
      })
      .where(eq(subscriptionsTable.id, current.id));
  }

  /** A refunded invoice pays for nothing from now on. */
  async endPaidPeriod(invoiceId: string, now: Date) {
    await this.tx
      .update(subscriptionsTable)
      .set({ paidPeriodEnd: now })
      .where(eq(subscriptionsTable.paidInvoiceId, invoiceId));
  }
}
