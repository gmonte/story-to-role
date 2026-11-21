/**
 * Creates StoryToRole's products, prices and Customer Portal settings in
 * the Stripe account of STRIPE_SECRET_KEY (billing spec, "Payments").
 * Idempotent: products and prices that exist are left as is; the portal
 * configurations are brought up to date. Run it through lerna so the root
 * `.env.local` is loaded:
 *
 *   pnpm exec lerna run stripe:setup --scope=@repo/api
 */
import Stripe from "stripe";

import { logger } from "@repo/common/tools/logger";

import { billingCatalog } from "../src/domains/billing/billing-catalog";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
if (
  process.env.NEXT_PUBLIC_ENV !== "production" &&
  !key.startsWith("sk_test_")
) {
  throw new Error("Outside production, only a sandbox (sk_test_) key is used");
}
const stripe = new Stripe(key);

async function ensureProduct(product: { id: string; name: string }) {
  try {
    return await stripe.products.retrieve(product.id);
  } catch (error) {
    // Only a missing product is created; any other failure stops here.
    if ((error as { code?: string }).code !== "resource_missing") throw error;
    logger.info(["stripe:setup"], `creating product ${product.id}`);
    return stripe.products.create({ id: product.id, name: product.name });
  }
}

async function ensurePrice(
  price: (typeof billingCatalog.prices)[keyof typeof billingCatalog.prices]
) {
  const existing = await stripe.prices.list({
    lookup_keys: [price.lookupKey],
    active: true,
  });
  if (existing.data[0]) return existing.data[0];
  logger.info(["stripe:setup"], `creating price ${price.lookupKey}`);
  return stripe.prices.create({
    product: billingCatalog.products[price.product].id,
    lookup_key: price.lookupKey,
    currency: "usd",
    unit_amount: price.usd,
    currency_options: { brl: { unit_amount: price.brl } },
    ...(price.interval ? { recurring: { interval: price.interval } } : {}),
  });
}

await ensureProduct(billingCatalog.products.subscription);
await ensureProduct(billingCatalog.products.own_key);
await ensureProduct(billingCatalog.products.pack);
const monthly = await ensurePrice(billingCatalog.prices.subscription_monthly);
const annual = await ensurePrice(billingCatalog.prices.subscription_annual);
const ownKeyMonthly = await ensurePrice(billingCatalog.prices.own_key_monthly);
const ownKeyAnnual = await ensurePrice(billingCatalog.prices.own_key_annual);
await ensurePrice(billingCatalog.prices.pack);

const businessProfile = { headline: "StoryToRole" };
const basics = {
  customer_update: {
    enabled: true,
    allowed_updates: ["email", "address"],
  },
  invoice_history: { enabled: true },
  payment_method_update: { enabled: true },
  subscription_cancel: { enabled: true, mode: "at_period_end" },
} satisfies Stripe.BillingPortal.ConfigurationCreateParams.Features;

// The default Customer Portal: card, invoices, cancelling. No price
// change: listing both subscriptions would let a credit subscriber switch
// to the own-key one without a key check (billing spec, "Payments").
const defaults = {
  business_profile: businessProfile,
  features: { ...basics, subscription_update: { enabled: false } },
};
const portals = await stripe.billingPortal.configurations.list({
  limit: 100,
});
const defaultPortal = portals.data.find((portal) => portal.is_default);
if (defaultPortal) {
  logger.info(["stripe:setup"], "updating the default Customer Portal");
  await stripe.billingPortal.configurations.update(defaultPortal.id, defaults);
} else {
  logger.info(["stripe:setup"], "creating the default Customer Portal");
  await stripe.billingPortal.configurations.create(defaults);
}

// The portal the app opens to switch between monthly and annual within one
// subscription (`subscription_update_confirm`): a dearer change applies at
// once, a shorter interval waits for the period's end.
const changes = {
  business_profile: businessProfile,
  metadata: { purpose: billingCatalog.intervalChangePortal },
  features: {
    ...basics,
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price"],
      proration_behavior: "always_invoice",
      products: [
        {
          product: billingCatalog.products.subscription.id,
          prices: [monthly.id, annual.id],
        },
        {
          product: billingCatalog.products.own_key.id,
          prices: [ownKeyMonthly.id, ownKeyAnnual.id],
        },
      ],
      schedule_at_period_end: {
        conditions: [
          { type: "shortening_interval" },
          { type: "decreasing_item_amount" },
        ],
      },
    },
  },
} satisfies Stripe.BillingPortal.ConfigurationCreateParams;
const changesPortal = portals.data.find(
  (portal) =>
    portal.metadata?.purpose === billingCatalog.intervalChangePortal &&
    portal.active
);
if (changesPortal) {
  logger.info(["stripe:setup"], "updating the interval-change portal");
  await stripe.billingPortal.configurations.update(changesPortal.id, changes);
} else {
  logger.info(["stripe:setup"], "creating the interval-change portal");
  await stripe.billingPortal.configurations.create(changes);
}
logger.info(["stripe:setup"], "Stripe catalog ready");
