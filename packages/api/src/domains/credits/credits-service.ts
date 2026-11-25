import { TRPCError } from "@trpc/server";

import type { DbClient } from "@repo/api/tools/db-client";
import { AiKeysRepository } from "@repo/api/domains/ai/ai-keys-repository";
import { AiUsageRepository } from "@repo/api/domains/ai/ai-usage-repository";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import { decodeCursor, encodeCursor } from "@repo/api/utils/db/keyset";

import { decideFunding } from "./credit-funding";
import {
  billingMonth,
  ensureMonthlyCredits,
  lockedStoredCredits,
} from "./credit-ledger";
import {
  currentPlan,
  paidMonth,
  planUsesKey,
  type PlanKind,
} from "./credit-plan";
import { creditCap, usdForUsage } from "./credit-pricing";
import { creditReserve, nearReserve, resumeEstimate } from "./credit-reserve";
import { settleTask } from "./settle-task";
import { CreditsRepository } from "./credits-repository";
import type {
  AdminUsers,
  CourtesyGrant,
  CreditSummary,
} from "./schemas/credits";
import type {
  PlatformUsage,
  PlatformUsageUsers,
  UsageOperations,
  UsageStatement,
} from "./schemas/usage-statement";
import {
  buildPlatformUsage,
  buildPlatformUsers,
  buildUsageOperations,
  buildUsageStatement,
} from "./usage-statement";
import { UsageStatementRepository } from "./usage-statement-repository";
import { grantWelcomeCredits } from "./welcome-credits";

export class CreditsService {
  constructor(private readonly db: DbClient) {}

  /**
   * The credit meter (billing spec, "Credit meter"): what the user can
   * still spend, by source and expiry, with the reserve and what the usual
   * actions may cost. This month's plan credits are granted on the way.
   */
  async summary(userId: string, now = new Date()): Promise<CreditSummary> {
    // Granting this month's credits is idempotent (by origin): no lock.
    return this.db.transaction(async (tx) => {
      const repository = new CreditsRepository(tx);
      await ensureMonthlyCredits(tx, userId, now);
      const lots = (await repository.liveLots(userId, now))
        .filter((row) => row.remaining > 0)
        .map((row) => ({
          source: row.lot.source,
          scope: row.lot.scope,
          remaining: row.remaining,
          expiresAt: row.lot.expiresAt,
        }))
        .sort(
          (a, b) =>
            (a.expiresAt?.getTime() ?? Infinity) -
            (b.expiresAt?.getTime() ?? Infinity)
        );
      const { kind, courtesy } = await currentPlan(tx, userId, now);
      const resume = await resumeEstimate(tx, userId);
      return {
        plan: kind,
        available: lots.reduce((total, lot) => total + lot.remaining, 0),
        reserved: await repository.reserved(userId),
        lots,
        reserve: await creditReserve(tx, userId, now),
        nearReserve: await nearReserve(tx, userId, now),
        estimates: {
          resume: resume.usual,
          resumeBase: resume.base,
          coverLetter: creditCap("generate_document", {
            documentKind: "cover_letter",
          }),
          linkedin: creditCap("generate_document", {
            documentKind: "linkedin",
          }),
          fitCheck: creditCap("analyze_opening"),
          adaptation: creditCap("adapt_document"),
          reReview: creditCap("review_document"),
          reReviewParallel: creditCap("review_document", { reviewers: 3 }),
          research: creditCap("research_company"),
          styleProfile: creditCap("extract_style_profile"),
          motivationTurn: creditCap("motivation_turn"),
          agentMessage: creditCap("profile_agent_turn"),
          sourceImport: creditCap("import_document"),
        },
        courtesy: courtesy
          ? { monthlyCredits: courtesy.monthlyCredits, endsAt: courtesy.endsAt }
          : null,
        key: await this.keyFunding(tx, userId, now),
        storedLocked: await lockedStoredCredits(tx, userId, "any", now),
      };
    });
  }

  /**
   * "Finish with credits": on a paid plan, the user agrees to spend their
   * stored credits (packs, welcome credits) on the next task that needs
   * them; the one after asks again.
   */
  async confirmStoredCredits(userId: string, now = new Date()) {
    await new CreditsRepository(this.db).confirmStoredCredits(
      userId,
      now,
      billingMonth(now).next
    );
  }

  /**
   * The usage statement (billing spec, "Usage statement") for a window,
   * by default the plan's current credit month: the subscription's billing
   * month, the calendar month for a courtesy grant, else the last 30 days.
   */
  async usageStatement(
    userId: string,
    input: {
      from?: Date;
      to?: Date;
      showsPlatformCost: boolean;
      now?: Date;
    }
  ): Promise<UsageStatement> {
    const window = await this.usageWindow(userId, input);
    const repository = new UsageStatementRepository(this.db);
    const calls = await repository.callsBetween(userId, window.from, window.to);
    return buildUsageStatement({
      calls,
      debitedByTask: await repository.debitedByTask(taskIdsOf(calls)),
      window,
      showsPlatformCost: input.showsPlatformCost,
    });
  }

  /**
   * A page of the usage statement's operations in the same window,
   * newest first (keyset pagination on the last call and the operation).
   */
  async usageOperations(
    userId: string,
    input: {
      from?: Date;
      to?: Date;
      showsPlatformCost: boolean;
      cursor?: string | null;
      limit: number;
      now?: Date;
    }
  ): Promise<UsageOperations> {
    const window = await this.usageWindow(userId, input);
    const repository = new UsageStatementRepository(this.db);
    const filters = {
      userId,
      ...window,
      showsPlatformCost: input.showsPlatformCost,
    };
    const after = decodeCursor(input.cursor);
    const page = await repository.operationsPage({
      ...filters,
      cursor:
        after && typeof after.keys[0] === "string"
          ? { lastCall: after.keys[0], operationId: after.id }
          : null,
      // One more than shown tells whether a next page exists.
      limit: input.limit + 1,
    });
    const shown = page.slice(0, input.limit);
    const calls = await repository.callsOfOperations(
      userId,
      shown.map((row) => row.operationId)
    );
    const built = buildUsageOperations({
      calls,
      debitedByTask: await repository.debitedByTask(taskIdsOf(calls)),
      showsPlatformCost: input.showsPlatformCost,
    });
    // In the page's own order, which Postgres decided to the microsecond.
    const byId = new Map(built.map((row) => [row.operationId, row]));
    const last = shown[shown.length - 1];
    return {
      data: shown.flatMap((row) => byId.get(row.operationId) ?? []),
      nextCursor:
        page.length > input.limit && last
          ? encodeCursor({ keys: [last.lastCall], id: last.operationId })
          : null,
      total: await repository.countOperations(filters),
    };
  }

  /** The window asked for, or the plan's current credit month. */
  private async usageWindow(
    userId: string,
    input: { from?: Date; to?: Date; now?: Date }
  ) {
    const now = input.now ?? new Date();
    const fallback = await this.defaultUsageWindow(userId, now);
    const window = {
      from: input.from ?? fallback.from,
      to: input.to ?? fallback.to,
    };
    if (window.from >= window.to) throw new TRPCError({ code: "BAD_REQUEST" });
    return window;
  }

  private async defaultUsageWindow(userId: string, now: Date) {
    const { subscription, courtesy } = await currentPlan(this.db, userId, now);
    const { paidPeriodStart, paidPeriodEnd } = subscription ?? {};
    const paid =
      paidPeriodStart && paidPeriodEnd
        ? paidMonth({ start: paidPeriodStart, end: paidPeriodEnd }, now)
        : null;
    if (paid) return { from: paid.start, to: paid.end };
    if (courtesy) {
      const { start, next } = billingMonth(now);
      return { from: start, to: next };
    }
    return { from: new Date(now.getTime() - 30 * 24 * 3600 * 1000), to: now };
  }

  /** The user's key, on the plans that use one (own-key, courtesy). */
  private async keyFunding(tx: DbClient, userId: string, now: Date) {
    const { kind } = await currentPlan(tx, userId, now);
    if (!planUsesKey(kind)) return null;
    const key = await new AiKeysRepository(tx).findByUserId(userId);
    if (!key) return null;
    const { start: monthStart } = billingMonth(now);
    const usage = await new AiUsageRepository(tx).keyFundedUsageSince(
      userId,
      monthStart
    );
    const stopped =
      key.status === "active"
        ? null
        : await new TasksRepository(tx).lastStoppedByKey(userId);
    return {
      status: key.status,
      stoppedTaskEstimate: stopped ? creditCap(stopped.type) : null,
      paysNext:
        (await decideFunding(tx, { userId, cap: 1, scope: "any", now })) ===
        "key",
      spentThisMonthUsd: Math.round(usdForUsage(usage) * 100) / 100,
    };
  }

  /**
   * The usage statement over every user, for the admin; without a window,
   * the current calendar month.
   */
  async platformUsage(input: {
    from?: Date;
    to?: Date;
    now?: Date;
  }): Promise<PlatformUsage> {
    const { window, calls, debitedByTask } = await this.platformCalls(input);
    return buildPlatformUsage({ calls, debitedByTask, window });
  }

  /**
   * A page of the admin's statement by user, the biggest spender first,
   * filtered by name or email. Spending is only known once each user's
   * operations are priced, so the cursor is an offset into that order.
   */
  async platformUsageUsers(input: {
    from?: Date;
    to?: Date;
    now?: Date;
    search?: string;
    cursor?: string | null;
    limit: number;
  }): Promise<PlatformUsageUsers> {
    const { window, calls, debitedByTask } = await this.platformCalls(input);
    const repository = new UsageStatementRepository(this.db);
    const users = buildPlatformUsers({
      calls,
      debitedByTask,
      window,
      users: await repository.usersByIds([
        ...new Set(calls.map((call) => call.userId)),
      ]),
    });
    const search = input.search?.trim().toLowerCase();
    const found = search
      ? users.filter(
          (user) =>
            user.email.toLowerCase().includes(search) ||
            !!user.name?.toLowerCase().includes(search)
        )
      : users;
    const offsetKey = decodeCursor(input.cursor)?.keys[0];
    const offset = typeof offsetKey === "number" ? offsetKey : 0;
    const next = offset + input.limit;
    return {
      data: found.slice(offset, next),
      nextCursor:
        next < found.length ? encodeCursor({ keys: [next], id: "" }) : null,
      total: found.length,
    };
  }

  /** Every user's calls in the admin's window: the calendar month by default. */
  private async platformCalls(input: { from?: Date; to?: Date; now?: Date }) {
    const month = billingMonth(input.now ?? new Date());
    const window = {
      from: input.from ?? month.start,
      to: input.to ?? month.next,
    };
    if (window.from >= window.to) throw new TRPCError({ code: "BAD_REQUEST" });
    const repository = new UsageStatementRepository(this.db);
    const calls = await repository.callsBetween(null, window.from, window.to);
    const debitedByTask = await repository.debitedByTask(taskIdsOf(calls));
    return { window, calls, debitedByTask };
  }

  /**
   * A page of the accounts for the admin, newest first, found by name or
   * email, each with its plan and its key's state.
   */
  async adminUsers(input: {
    search?: string;
    plan?: PlanKind;
    cursor?: string | null;
    limit: number;
    now?: Date;
  }): Promise<AdminUsers> {
    const now = input.now ?? new Date();
    const repository = new CreditsRepository(this.db);
    const after = decodeCursor(input.cursor);
    const page = await repository.adminUsersPage({
      search: input.search,
      plan: input.plan,
      now,
      cursor:
        after && typeof after.keys[0] === "string"
          ? { createdAt: after.keys[0], userId: after.id }
          : null,
      // One more than shown tells whether a next page exists.
      limit: input.limit + 1,
    });
    const shown = page.slice(0, input.limit);
    const last = shown[shown.length - 1];
    return {
      data: shown.map((user) => ({
        userId: user.userId,
        email: user.email,
        name: user.name || null,
        createdAt: user.createdAt,
        plan: user.plan,
        keyStatus: user.keyStatus,
      })),
      nextCursor:
        page.length > input.limit && last
          ? encodeCursor({ keys: [last.createdAtText], id: last.userId })
          : null,
      total: await repository.countAdminUsers({ ...input, now }),
    };
  }

  listCourtesyGrants(): Promise<CourtesyGrant[]> {
    return new CreditsRepository(this.db).listCourtesyGrants();
  }

  /**
   * Grants the paid plan without a subscription (billing spec, "Courtesy
   * plan"): one active grant per user, so a new one replaces the current.
   */
  async grantCourtesy(input: {
    adminUserId: string;
    email: string;
    monthlyCredits: number;
    endsAt: Date | null;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    if (input.endsAt && input.endsAt <= now) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }
    return this.db.transaction(async (tx) => {
      const repository = new CreditsRepository(tx);
      const user = await repository.findActiveUserByEmail(input.email);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      await repository.lockUser(user.id);
      const current = await repository.activeCourtesy(user.id, now);
      if (current) await this.end(tx, current.id, now);
      const grant = await repository.insertCourtesyGrant({
        userId: user.id,
        monthlyCredits: input.monthlyCredits,
        endsAt: input.endsAt,
        grantedBy: input.adminUserId,
      });
      await ensureMonthlyCredits(tx, user.id, now);
      return grant;
    });
  }

  /** Ends a courtesy grant now: the user returns to Free. */
  async endCourtesy(input: { courtesyGrantId: string; now?: Date }) {
    const now = input.now ?? new Date();
    await this.db.transaction(async (tx) => {
      const repository = new CreditsRepository(tx);
      const grant = await repository.findCourtesyGrant(input.courtesyGrantId);
      if (!grant) throw new TRPCError({ code: "NOT_FOUND" });
      if (grant.endedAt) return;
      await repository.lockUser(grant.userId);
      await this.end(tx, grant.id, now);
    });
  }

  private async end(tx: DbClient, courtesyGrantId: string, now: Date) {
    const repository = new CreditsRepository(tx);
    await repository.endCourtesyGrant(courtesyGrantId, now);
    await repository.expireCourtesyLots(courtesyGrantId, now);
  }

  /**
   * Rebuilds the grants StoryToRole owns (billing spec, "Credit ledger"):
   * welcome credits for every user and this month's plan credits. Every
   * grant is keyed by its origin, so running it again duplicates nothing
   * and restores what is missing. Stripe's grants join in their slice.
   * Reservations that runs left open (killed, crashed) settle too.
   */
  async reconcile(now = new Date()) {
    const repository = new CreditsRepository(this.db);
    const users = await repository.listActiveUserIds();
    let granted = 0;
    for (const user of users) {
      await this.db.transaction(async (tx) => {
        await new CreditsRepository(tx).lockUser(user.id);
        if (await grantWelcomeCredits(tx, user.id)) granted += 1;
        await ensureMonthlyCredits(tx, user.id, now);
      });
    }
    // Past the longest run (an hour), a pending task is dead.
    const stale = await repository.openReservations(
      new Date(now.getTime() - 2 * 3600 * 1000)
    );
    for (const task of stale) {
      await settleTask(this.db, {
        userId: task.userId,
        taskId: task.taskId,
        succeeded: task.status === "completed",
      });
    }
    return { users: users.length, granted, settled: stale.length };
  }
}

const taskIdsOf = (calls: Array<{ taskId: string | null }>) => [
  ...new Set(calls.flatMap((call) => (call.taskId ? [call.taskId] : []))),
];
