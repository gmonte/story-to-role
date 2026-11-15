import { schedules } from "@trigger.dev/sdk";

import { db } from "@repo/api/tools/db";

import { CreditsService } from "../credits-service";

/**
 * Billing spec, "Credit ledger": the reconciliation job. Hourly, so a
 * reservation a dead run left open is back within the hour.
 */
export const reconcileCreditsTask = schedules.task({
  id: "reconcile_credits",
  cron: "15 * * * *",
  run: () => new CreditsService(db).reconcile(),
});
