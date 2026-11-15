import Stripe from "stripe";

import { env } from "@repo/common/env/web.env";

let client: Stripe | null = null;

/**
 * The Stripe client, created on first use (the SDK throws without a key,
 * and builds import this file without one). The SDK pins the API version
 * the webhook destinations use (billing spec, "Payments").
 */
export function getStripe() {
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}
