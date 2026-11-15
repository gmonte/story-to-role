import { eq } from "drizzle-orm";

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

  /** The user's most recently changed subscription. */
  findSubscriptionByUserId(userId: string) {
    return this.tx
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId))
      .orderBy(subscriptionsTable.currentPeriodStart)
      .then((rows) => rows.at(-1) ?? null);
  }

  async upsertSubscription(row: Insert<typeof subscriptionsTable>) {
    const { stripeSubscriptionId, userId: _userId, ...changes } = row;
    await this.tx.insert(subscriptionsTable).values(row).onConflictDoUpdate({
      target: subscriptionsTable.stripeSubscriptionId,
      set: changes,
    });
    return stripeSubscriptionId;
  }
}
