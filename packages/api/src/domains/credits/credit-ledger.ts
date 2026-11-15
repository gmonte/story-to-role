import type { DbClient } from "@repo/api/tools/db-client";

import { currentPlan, paidMonth } from "./credit-plan";
import { creditSettings } from "./credit-pricing";
import { CreditsRepository } from "./credits-repository";
import {
  type CreditScope,
  type CreditSource,
  planSources,
} from "./schemas/credits";

/**
 * Not enough credits for what an action may cost (its cap); `kept` is what
 * the credit reserve holds back from it, `stored` what confirming "Finish
 * with credits" would add.
 */
export class InsufficientCreditsError extends Error {
  constructor(
    readonly needed: number,
    readonly available: number,
    readonly kept = 0,
    readonly stored = 0
  ) {
    super(`Needs up to ${needed} credits, ${available} available`);
  }
}

/** The month a date falls in ("2026-11") and the instant the next one starts. */
export function billingMonth(now: Date) {
  const key = now.toISOString().slice(0, 7);
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  );
  return { key, next };
}

/**
 * Grants a lot of credits once per origin (billing spec: "Every grant
 * points to its origin"): granting the same origin again changes nothing.
 */
export async function grantCredits(
  db: DbClient,
  input: {
    userId: string;
    source: CreditSource;
    amount: number;
    origin: string;
    expiresAt: Date | null;
    scope?: CreditScope;
  }
) {
  // The lot and its grant entry together: a lot without its entry would
  // hold its origin with no balance, and block every later grant.
  return db.transaction(async (tx) => {
    const repository = new CreditsRepository(tx);
    const lot = await repository.insertLot({
      userId: input.userId,
      source: input.source,
      scope: input.scope ?? "any",
      amount: input.amount,
      expiresAt: input.expiresAt,
      origin: input.origin,
    });
    if (lot && input.amount > 0) {
      await repository.insertEntries([
        {
          userId: input.userId,
          lotId: lot.id,
          kind: "grant",
          amount: input.amount,
        },
      ]);
    }
    return lot;
  });
}

/**
 * This month's plan credits, granted when first needed: the subscription's
 * monthly credits from its paid invoice (a billing month at a time; none
 * before payment), a courtesy grant's, or Free's monthly credits for fit
 * checks. Idempotent per month; they expire when the month ends.
 */
export async function ensureMonthlyCredits(
  tx: DbClient,
  userId: string,
  now: Date
) {
  const { key, next } = billingMonth(now);
  const plan = await currentPlan(tx, userId, now);
  const { subscription, courtesy } = plan;
  if (subscription) {
    const { paidInvoiceId, paidPeriodStart, paidPeriodEnd } = subscription;
    const month =
      paidInvoiceId && paidPeriodStart && paidPeriodEnd
        ? paidMonth({ start: paidPeriodStart, end: paidPeriodEnd }, now)
        : null;
    if (paidInvoiceId && month) {
      await grantCredits(tx, {
        userId,
        source: "subscription",
        amount: creditSettings.subscriptionMonthlyCredits,
        origin: `${invoiceOrigin(paidInvoiceId)}${month.start.toISOString()}`,
        expiresAt: month.end,
      });
    }
    return;
  }
  if (courtesy) {
    await grantCredits(tx, {
      userId,
      source: "courtesy",
      amount: courtesy.monthlyCredits,
      origin: `courtesy:${courtesy.id}:${key}`,
      expiresAt:
        courtesy.endsAt && courtesy.endsAt < next ? courtesy.endsAt : next,
    });
    return;
  }
  await grantCredits(tx, {
    userId,
    source: "monthly_free",
    scope: "fit_check",
    amount: creditSettings.monthlyFreeCredits,
    origin: `monthly_free:${userId}:${key}`,
    expiresAt: next,
  });
}

/** Every lot a paid invoice granted starts with this origin. */
export const invoiceOrigin = (invoiceId: string) => `invoice:${invoiceId}:`;

/** A pack's lot, granted from its Checkout session. */
export const packOrigin = (checkoutSessionId: string) =>
  `pack:${checkoutSessionId}`;

/**
 * Takes back what is left of lots whose payment was refunded (a pack, an
 * invoice's months): they end now, with the user's row locked.
 */
export async function revokeLots(
  db: DbClient,
  input: { userId: string; originPrefix: string; now?: Date }
) {
  await db.transaction(async (tx) => {
    const repository = new CreditsRepository(tx);
    await repository.lockUser(input.userId);
    await repository.expireLotsByOrigin(
      input.userId,
      input.originPrefix,
      input.now ?? new Date()
    );
  });
}

/**
 * The lots a payment may draw on, in the funding order (billing spec):
 * plan credits first, those expiring first; then stored credits (packs and
 * welcome credits), those expiring first. Fit-check lots pay fit checks.
 * On a paid plan, stored credits wait for the user's confirmation
 * ("Finish with credits"), never spent silently: `allowStored`.
 */
export async function spendableLots(
  tx: DbClient,
  userId: string,
  scope: CreditScope,
  now: Date,
  allowStored?: boolean
) {
  const repository = new CreditsRepository(tx);
  const lots = await repository.liveLots(userId, now);
  const storedAllowed =
    allowStored ?? (await storedCreditsAllowed(tx, userId, now));
  const order = (source: CreditSource) =>
    planSources.includes(source) ? 0 : 1;
  const time = (date: Date | null) =>
    date?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return lots
    .filter(
      (row) =>
        row.remaining > 0 &&
        (row.lot.scope === "any" || row.lot.scope === scope) &&
        (storedAllowed || planSources.includes(row.lot.source))
    )
    .sort(
      (a, b) =>
        order(a.lot.source) - order(b.lot.source) ||
        time(a.lot.expiresAt) - time(b.lot.expiresAt)
    );
}

/**
 * Whether stored credits may be spent without asking: always on Free, on
 * a paid plan once the user confirmed "Finish with credits".
 */
export async function storedCreditsAllowed(
  tx: DbClient,
  userId: string,
  now: Date
) {
  return (
    (await currentPlan(tx, userId, now)).kind === "free" ||
    (await new CreditsRepository(tx).storedCreditsConfirmed(userId, now))
  );
}

const sum = (rows: Array<{ remaining: number }>) =>
  rows.reduce((total, row) => total + row.remaining, 0);

/** What the user can spend now on an action of this scope. */
export async function spendableTotal(
  tx: DbClient,
  userId: string,
  scope: CreditScope,
  now: Date,
  allowStored?: boolean
) {
  return sum(await spendableLots(tx, userId, scope, now, allowStored));
}

/**
 * Throws unless `cap` fits in what is spendable once `keep` (the credit
 * reserve) is held back.
 */
export function assertFits(input: {
  cap: number;
  available: number;
  keep: number;
  // Stored credits that would count once the user confirms.
  stored?: number;
}) {
  const usable = Math.max(0, input.available - input.keep);
  if (usable < input.cap) {
    throw new InsufficientCreditsError(
      input.cap,
      usable,
      Math.min(input.keep, input.available),
      input.stored ?? 0
    );
  }
}

/** Stored credits a paid-plan user hasn't confirmed spending yet. */
export async function lockedStoredCredits(
  tx: DbClient,
  userId: string,
  scope: CreditScope,
  now: Date
) {
  if (await storedCreditsAllowed(tx, userId, now)) return 0;
  return (
    (await spendableTotal(tx, userId, scope, now, true)) -
    (await spendableTotal(tx, userId, scope, now, false))
  );
}

/**
 * Reserves an action's cap when its task starts, in the same transaction
 * (billing spec: "a balance can never be overspent and two concurrent
 * tasks cannot spend the same credits"). The user's row is locked, so
 * reservations run one at a time.
 */
export async function reserveCredits(
  tx: DbClient,
  input: {
    userId: string;
    taskId: string;
    cap: number;
    scope: CreditScope;
    // Credits the action may not touch (the credit reserve).
    keep?: number;
    now?: Date;
  }
) {
  if (input.cap <= 0) return;
  const now = input.now ?? new Date();
  const repository = new CreditsRepository(tx);
  await repository.lockUser(input.userId);
  await ensureMonthlyCredits(tx, input.userId, now);
  const lots = await spendableLots(tx, input.userId, input.scope, now);
  const available = sum(lots);
  if (available - (input.keep ?? 0) < input.cap) {
    assertFits({
      cap: input.cap,
      available,
      keep: input.keep ?? 0,
      stored: await lockedStoredCredits(tx, input.userId, input.scope, now),
    });
  }
  let left = input.cap;
  const entries = [];
  for (const row of lots) {
    if (left === 0) break;
    const take = Math.min(left, row.remaining);
    entries.push({
      userId: input.userId,
      lotId: row.lot.id,
      kind: "reserve" as const,
      amount: -take,
      taskId: input.taskId,
    });
    left -= take;
  }
  await repository.insertEntries(entries);
}

/**
 * Settles a task to its actual cost, never above the cap: the reservation
 * is released and the cost debited from the same lots, in order. A failed
 * task settles at zero, releasing everything. Settling twice does nothing.
 */
export async function settleCredits(
  tx: DbClient,
  input: { userId: string; taskId: string; actual: number }
) {
  const repository = new CreditsRepository(tx);
  await repository.lockUser(input.userId);
  const entries = await repository.taskEntries(input.taskId);
  if (entries.some((entry) => entry.kind === "release")) return;
  const reservations = entries.filter((entry) => entry.kind === "reserve");
  if (reservations.length === 0) return;
  let cost = Math.max(0, input.actual);
  const rows = [];
  for (const reservation of reservations) {
    const reserved = -reservation.amount;
    rows.push({
      userId: input.userId,
      lotId: reservation.lotId,
      kind: "release" as const,
      amount: reserved,
      taskId: input.taskId,
    });
    const debit = Math.min(cost, reserved);
    if (debit > 0) {
      rows.push({
        userId: input.userId,
        lotId: reservation.lotId,
        kind: "debit" as const,
        amount: -debit,
        taskId: input.taskId,
      });
      cost -= debit;
    }
  }
  await repository.insertEntries(rows);
}
