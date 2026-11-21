import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { createTable } from "@repo/api/utils/db/create-table";

import type {
  BillingInterval,
  SubscriptionPlan,
  SubscriptionStatus,
} from "../schemas/billing";

/**
 * A user's Stripe customer in this environment (billing spec, "Payments").
 * Every non-production environment shares one sandbox: an event whose
 * customer is not here belongs to another environment and is ignored.
 */
export const billingCustomersTable = createTable(
  "billing_customers",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    userId: d
      .uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    stripeCustomerId: d.text().notNull(),
  }),
  (t) => [
    unique("billing_customers_user_id_unique").on(t.userId),
    unique("billing_customers_stripe_customer_id_unique").on(
      t.stripeCustomerId
    ),
  ]
);

/**
 * The subscription as Stripe last reported it; its paid period drives the
 * monthly credits, granted from here without calling Stripe.
 */
export const subscriptionsTable = createTable(
  "subscriptions",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
    userId: d
      .uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    stripeSubscriptionId: d.text().notNull(),
    plan: d.text().$type<SubscriptionPlan>().notNull().default("credits"),
    status: d.text().$type<SubscriptionStatus>().notNull(),
    interval: d.text().$type<BillingInterval>().notNull(),
    currentPeriodStart: d.timestamp({ withTimezone: true }).notNull(),
    currentPeriodEnd: d.timestamp({ withTimezone: true }).notNull(),
    cancelAtPeriodEnd: d.boolean().notNull().default(false),
    // The last paid invoice and the service period it paid for: monthly
    // credits are granted from it, never before payment (billing spec:
    // "each paid invoice … grants that month's credits").
    paidInvoiceId: d.text(),
    paidPeriodStart: d.timestamp({ withTimezone: true }),
    paidPeriodEnd: d.timestamp({ withTimezone: true }),
    // A credit subscription the own-key one replaced (billing spec,
    // "Switching plans"): its paid period keeps granting monthly credits.
    replacedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    unique("subscriptions_stripe_subscription_id_unique").on(
      t.stripeSubscriptionId
    ),
    index("subscriptions_user_id_idx").on(t.userId),
  ]
);
