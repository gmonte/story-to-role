import { stripeWebhook } from "@repo/api/domains/billing/webhooks/stripe-webhook";

export const POST = (request: Request) => stripeWebhook(request);
