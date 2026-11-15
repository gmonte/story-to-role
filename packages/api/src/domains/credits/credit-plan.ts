import type { DbClient } from "@repo/api/tools/db-client";

import { CreditsRepository } from "./credits-repository";

/**
 * The user's plan (billing spec, "Plans and AI funding"): the paid plan
 * through a Stripe subscription or a courtesy grant, else Free.
 */
export async function currentPlan(db: DbClient, userId: string, now: Date) {
  const repository = new CreditsRepository(db);
  const subscription = await repository.activeSubscription(userId, now);
  const courtesy = await repository.activeCourtesy(userId, now);
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

/**
 * The subscription month `now` falls in (billing spec, "Credit expiry":
 * monthly credits expire at the end of each billing month). A monthly
 * subscription's month is its period; an annual one's year is split into
 * months from its start.
 */
export function subscriptionMonth(
  subscription: {
    interval: "month" | "year";
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  },
  now: Date
) {
  if (subscription.interval === "month") {
    return {
      start: subscription.currentPeriodStart,
      end: subscription.currentPeriodEnd,
    };
  }
  const addMonths = (months: number) => {
    const date = new Date(subscription.currentPeriodStart);
    date.setUTCMonth(date.getUTCMonth() + months);
    return date;
  };
  let month = 0;
  while (month < 11 && addMonths(month + 1) <= now) month += 1;
  const end = addMonths(month + 1);
  return {
    start: addMonths(month),
    end:
      end < subscription.currentPeriodEnd ? end : subscription.currentPeriodEnd,
  };
}
