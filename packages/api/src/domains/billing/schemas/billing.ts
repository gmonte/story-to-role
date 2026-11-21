import { z } from "zod";

export const billingIntervalSchema = z.enum(["month", "year"]);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

/** Stripe's subscription statuses. Credits come from paid invoices only. */
export const subscriptionStatusSchema = z.enum([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/**
 * A subscription that still exists for the user: paid, or waiting on a
 * payment Stripe keeps retrying. Abandoned first payments and cancelled
 * ones don't count.
 */
export const isLiveSubscription = (status: SubscriptionStatus) =>
  status === "active" ||
  status === "trialing" ||
  status === "past_due" ||
  status === "unpaid";

/** The two subscriptions (billing spec, "Subscription"). */
export const subscriptionPlanSchema = z.enum(["credits", "own_key"]);
export type SubscriptionPlan = z.infer<typeof subscriptionPlanSchema>;

/** What a checkout buys: a subscription, monthly or annual, or a pack. */
export const checkoutProductSchema = z.enum([
  "subscription_monthly",
  "subscription_annual",
  "own_key_monthly",
  "own_key_annual",
  "pack",
]);
export type CheckoutProduct = z.infer<typeof checkoutProductSchema>;

export const billingStatusSchema = z.object({
  subscription: z
    .object({
      plan: subscriptionPlanSchema,
      status: subscriptionStatusSchema,
      interval: billingIntervalSchema,
      currentPeriodEnd: z.date(),
      cancelAtPeriodEnd: z.boolean(),
    })
    .nullable(),
  // After a switch to the own-key subscription: until when the replaced
  // credit subscription's paid period keeps granting credits.
  carryoverEndsAt: z.date().nullable(),
  hasCustomer: z.boolean(),
});
export type BillingStatus = z.infer<typeof billingStatusSchema>;
