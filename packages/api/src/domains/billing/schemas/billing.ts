import { z } from "zod";

export const billingIntervalSchema = z.enum(["month", "year"]);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

/** Stripe's subscription statuses; only `active` grants monthly credits. */
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

/** What a checkout buys: the subscription, monthly or annual, or a pack. */
export const checkoutProductSchema = z.enum([
  "subscription_monthly",
  "subscription_annual",
  "pack",
]);
export type CheckoutProduct = z.infer<typeof checkoutProductSchema>;

export const billingStatusSchema = z.object({
  subscription: z
    .object({
      status: subscriptionStatusSchema,
      interval: billingIntervalSchema,
      currentPeriodEnd: z.date(),
      cancelAtPeriodEnd: z.boolean(),
    })
    .nullable(),
  hasCustomer: z.boolean(),
});
export type BillingStatus = z.infer<typeof billingStatusSchema>;
