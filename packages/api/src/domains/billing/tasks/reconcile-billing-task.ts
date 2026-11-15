import { schedules } from "@trigger.dev/sdk";

import { db } from "@repo/api/tools/db";

import { BillingService } from "../billing-service";

/**
 * Billing spec, "Webhooks are a shortcut; reconciliation is the
 * guarantee": renewals, cancellations and refunds from Stripe, for this
 * environment's customers only.
 */
export const reconcileBillingTask = schedules.task({
  id: "reconcile_billing",
  cron: "45 */6 * * *",
  run: () => new BillingService(db).reconcile(),
});
