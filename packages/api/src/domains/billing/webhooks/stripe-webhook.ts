import type Stripe from "stripe";

import { db } from "@repo/api/tools/db";
import { getStripe } from "@repo/api/tools/stripe/stripe-client";
import { env } from "@repo/common/env/web.env";
import { logger } from "@repo/common/tools/logger";

import { BillingService } from "../billing-service";

const logTags = ["stripe", "webhooks"];

/**
 * Stripe's webhook (billing spec, "Payments"): the signature is checked,
 * the event applied, and anything this environment doesn't handle (other
 * events, other environments' customers) answered 200.
 */
export async function stripeWebhook(request: Request) {
  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      await request.text(),
      request.headers.get("stripe-signature") ?? "",
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    logger.error(logTags, "Invalid Stripe signature", { error });
    return new Response("Invalid signature", { status: 400 });
  }

  // The payload carries personal data: only its type and id are logged.
  logger.info(logTags, `Received ${event.type}`, { id: event.id });
  try {
    const { handled } = await new BillingService(db).handleEvent(event);
    return Response.json({ received: true, handled });
  } catch (error) {
    logger.error(logTags, `Failed to apply ${event.type}`, { error });
    // A 500 makes Stripe retry; reconciliation covers what retries miss.
    return new Response("Failed", { status: 500 });
  }
}
