import type { CheckoutProduct } from "./schemas/billing";

/**
 * What StoryToRole sells, created in Stripe by `stripe:setup` (billing
 * spec, "Payments": products and prices come from a versioned script so
 * every environment matches). One price per offer with a BRL and a USD
 * amount; Checkout presents the customer's currency. Amounts are the
 * spec's initial hypothesis, in the smallest unit; a price change gets a
 * new lookup key (v2), never an edit.
 */
export const billingCatalog = {
  products: {
    subscription: {
      id: "storytorole_subscription",
      name: "StoryToRole subscription",
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
    pack: {
      lookupKey: "pack_300_v1",
      product: "pack",
      interval: null,
      usd: 800,
      brl: 3900,
    },
  },
} as const satisfies {
  products: Record<string, { id: string; name: string }>;
  prices: Record<
    CheckoutProduct,
    {
      lookupKey: string;
      product: "subscription" | "pack";
      interval: "month" | "year" | null;
      usd: number;
      brl: number;
    }
  >;
};

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
