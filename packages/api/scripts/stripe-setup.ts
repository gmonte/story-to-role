/**
 * Creates StoryToRole's products, prices and Customer Portal settings in
 * the Stripe account of STRIPE_SECRET_KEY (billing spec, "Payments").
 * Idempotent: what exists is left as is. Run it through lerna so the root
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
  } catch {
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
await ensureProduct(billingCatalog.products.pack);
const monthly = await ensurePrice(billingCatalog.prices.subscription_monthly);
const annual = await ensurePrice(billingCatalog.prices.subscription_annual);
await ensurePrice(billingCatalog.prices.pack);

// The Customer Portal: card, invoices, monthly or annual, cancelling.
const portals = await stripe.billingPortal.configurations.list({
  is_default: true,
  limit: 1,
});
if (portals.data.length === 0) {
  logger.info(["stripe:setup"], "creating the Customer Portal configuration");
  await stripe.billingPortal.configurations.create({
    business_profile: { headline: "StoryToRole" },
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "address"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products: [
          {
            product: billingCatalog.products.subscription.id,
            prices: [monthly.id, annual.id],
          },
        ],
      },
    },
  });
}
logger.info(["stripe:setup"], "Stripe catalog ready");
