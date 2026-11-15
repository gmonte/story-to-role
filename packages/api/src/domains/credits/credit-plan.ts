import { BillingRepository } from "@repo/api/domains/billing/billing-repository";
import type { DbClient } from "@repo/api/tools/db-client";

import { CreditsRepository } from "./credits-repository";

/**
 * The user's plan (billing spec, "Plans and AI funding"): the paid plan
 * through a live Stripe subscription or, for a user without one, a
 * courtesy grant; else Free.
 */
export async function currentPlan(db: DbClient, userId: string, now: Date) {
  const subscription = await new BillingRepository(db).findLiveSubscription(
    userId,
    now
  );
  const courtesy = subscription
    ? null
    : await new CreditsRepository(db).activeCourtesy(userId, now);
  return {
    subscription,
    courtesy,
    kind: subscription
      ? ("subscription" as const)
      : courtesy
        ? ("courtesy" as const)
        : ("free" as const),
  };
}

/** `months` calendar months after `date`, its day clamped to the month's end. */
function addMonths(date: Date, months: number) {
  const target = new Date(date);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target;
}

/**
 * The billing month `now` falls in within a paid period (billing spec,
 * "Credit expiry": monthly credits expire at the end of each billing
 * month). A monthly invoice pays for one month; an annual one's year is
 * split into months from its start. Null outside the paid period.
 */
export function paidMonth(
  period: { start: Date; end: Date },
  now: Date
): { start: Date; end: Date } | null {
  if (now < period.start || now >= period.end) return null;
  let month = 0;
  while (addMonths(period.start, month + 1) <= now) month += 1;
  const end = addMonths(period.start, month + 1);
  return {
    start: addMonths(period.start, month),
    end: end < period.end ? end : period.end,
  };
}
