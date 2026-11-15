import { schedules } from "@trigger.dev/sdk";

import { db } from "@repo/api/tools/db";

import { CreditsService } from "../credits-service";

/** Billing spec, "Credit ledger": the reconciliation job, daily. */
export const reconcileCreditsTask = schedules.task({
  id: "reconcile_credits",
  cron: "30 3 * * *",
  run: () => new CreditsService(db).reconcile(),
});
