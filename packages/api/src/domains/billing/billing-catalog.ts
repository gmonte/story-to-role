import type { CheckoutProduct, SubscriptionPlan } from "./schemas/billing";

/**
 * What StoryToRole sells, created in Stripe by `stripe:setup` (billing
 * spec, "Payments": products and prices come from a versioned script so
 * every environment matches). One price per offer with a BRL and a USD
 * amount; Checkout presents the customer's currency. Amounts are the
 * spec's initial hypothesis, in the smallest unit; a price change gets a
 * new lookup key (v2), never an edit.
 */
export const billingCatalog = {
  // The metadata that marks the Customer Portal configuration for
  // switching between monthly and annual (stripe:setup creates it).
  intervalChangePortal: "interval_change",
  products: {
    subscription: {
      id: "storytorole_subscription",
      name: "StoryToRole subscription",
    },
    own_key: {
      id: "storytorole_own_key",
      name: "StoryToRole own-key subscription",
    },
    pack: { id: "storytorole_pack", name: "StoryToRole credit pack" },
  },
  prices: {
    subscription_monthly: {
      lookupKey: "subscription_monthly_v1",
      product: "subscription",
      interval: "month",
      usd: 1200,
      brl: 5900,
    },
    subscription_annual: {
      lookupKey: "subscription_annual_v1",
      product: "subscription",
      interval: "year",
      usd: 12000,
      brl: 59000,
    },
    own_key_monthly: {
      lookupKey: "own_key_monthly_v1",
      product: "own_key",
      interval: "month",
      usd: 500,
      brl: 1990,
    },
    own_key_annual: {
      lookupKey: "own_key_annual_v1",
      product: "own_key",
      interval: "year",
      usd: 5000,
      brl: 19900,
    },
    pack: {
      lookupKey: "pack_300_v1",
      product: "pack",
      interval: null,
      usd: 800,
      brl: 3900,
    },
  },
} as const satisfies {
  intervalChangePortal: string;
  products: Record<string, { id: string; name: string }>;
  prices: Record<
    CheckoutProduct,
    {
      lookupKey: string;
      product: "subscription" | "own_key" | "pack";
      interval: "month" | "year" | null;
      usd: number;
      brl: number;
    }
  >;
};

/**
 * The plan a Stripe product subscribes to (billing spec, "Subscription"):
 * the own-key subscription, else the credit subscription.
 */
export const planOfProduct = (productId: string | null): SubscriptionPlan =>
  productId === billingCatalog.products.own_key.id ? "own_key" : "credits";

/** The webhook events StoryToRole handles (and `stripe:listen` forwards). */
export const stripeEvents = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
] as const;
