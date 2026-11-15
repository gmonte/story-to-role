import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import {
  billingMonth,
  grantCredits,
  InsufficientCreditsError,
  reserveCredits,
  settleCredits,
  spendableLots,
} from "./credit-ledger";
import { creditCap, creditsForUsage } from "./credit-pricing";
import { CreditsRepository } from "./credits-repository";

const now = new Date("2026-11-15T12:00:00Z");

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser("ada@example.com", { credits: 0 });
  const task = async (
    type: "analyze_opening" | "generate_document" = "generate_document"
  ) => (await new TasksRepository(db).create({ userId: user.id, type })).id;
  const balance = async (scope: "any" | "fit_check" = "any") =>
    (await spendableLots(db, user.id, scope, now)).reduce(
      (total, row) => total + row.remaining,
      0
    );
  return { db, user, task, balance };
}

describe("credit ledger", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("grants once per origin", async () => {
    const ctx = await setup();
    const welcome = {
      userId: ctx.user.id,
      source: "welcome" as const,
      amount: 200,
      origin: `welcome:${ctx.user.id}`,
      expiresAt: null,
    };
    expect(await grantCredits(ctx.db, welcome)).not.toBeNull();
    expect(await grantCredits(ctx.db, welcome)).toBeNull();
    expect(await ctx.balance()).toBe(200);
  });

  it("spends plan credits before stored ones, those expiring first", async () => {
    const ctx = await setup();
    await grantCredits(ctx.db, {
      userId: ctx.user.id,
      source: "welcome",
      amount: 200,
      origin: "welcome",
      expiresAt: null,
    });
    await grantCredits(ctx.db, {
      userId: ctx.user.id,
      source: "pack",
      amount: 100,
      origin: "pack",
      expiresAt: new Date("2027-11-01T00:00:00Z"),
    });
    await grantCredits(ctx.db, {
      userId: ctx.user.id,
      source: "courtesy",
      amount: 50,
      origin: "courtesy",
      expiresAt: new Date("2026-12-01T00:00:00Z"),
    });
    const lots = await spendableLots(ctx.db, ctx.user.id, "any", now);
    expect(lots.map((row) => row.lot.source)).toEqual([
      "courtesy",
      "pack",
      "welcome",
    ]);

    const taskId = await ctx.task();
    // The month's free fit-check credits are granted on the way, unused here.
    await reserveCredits(ctx.db, {
      userId: ctx.user.id,
      taskId,
      cap: 80,
      scope: "any",
      now,
    });
    expect(await ctx.balance()).toBe(270);
    await settleCredits(ctx.db, { userId: ctx.user.id, taskId, actual: 60 });
    const after = await spendableLots(ctx.db, ctx.user.id, "any", now);
    expect(after.map((row) => [row.lot.source, row.remaining])).toEqual([
      ["pack", 90],
      ["welcome", 200],
    ]);
  });

  it("keeps Free's monthly credits for fit checks", async () => {
    const ctx = await setup();
    const taskId = await ctx.task("analyze_opening");
    await reserveCredits(ctx.db, {
      userId: ctx.user.id,
      taskId,
      cap: 3,
      scope: "fit_check",
      now,
    });
    expect(await ctx.balance("fit_check")).toBe(7);
    // Nothing else may spend them.
    await expect(
      reserveCredits(ctx.db, {
        userId: ctx.user.id,
        taskId: await ctx.task(),
        cap: 1,
        scope: "any",
        now,
      })
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    // Next month brings new ones; this month's expire.
    const next = new Date("2026-12-02T00:00:00Z");
    await reserveCredits(ctx.db, {
      userId: ctx.user.id,
      taskId: await ctx.task("analyze_opening"),
      cap: 1,
      scope: "fit_check",
      now: next,
    });
    expect(
      (await spendableLots(ctx.db, ctx.user.id, "fit_check", next)).map(
        (row) => row.lot.origin
      )
    ).toEqual([`monthly_free:${ctx.user.id}:${billingMonth(next).key}`]);
  });

  it("never lets two tasks spend the same credits", async () => {
    const ctx = await setup();
    await grantCredits(ctx.db, {
      userId: ctx.user.id,
      source: "welcome",
      amount: 100,
      origin: "welcome",
      expiresAt: null,
    });
    const [first, second] = [await ctx.task(), await ctx.task()];
    const results = await Promise.allSettled(
      [first, second].map((taskId) =>
        ctx.db.transaction((tx) =>
          reserveCredits(tx, {
            userId: ctx.user.id,
            taskId,
            cap: 60,
            scope: "any",
            now,
          })
        )
      )
    );
    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(await ctx.balance()).toBe(40);
  });

  it("settles to the actual cost, never above the cap, and a failure releases all", async () => {
    const ctx = await setup();
    await grantCredits(ctx.db, {
      userId: ctx.user.id,
      source: "welcome",
      amount: 100,
      origin: "welcome",
      expiresAt: null,
    });
    const over = await ctx.task();
    await reserveCredits(ctx.db, {
      userId: ctx.user.id,
      taskId: over,
      cap: 30,
      scope: "any",
      now,
    });
    await settleCredits(ctx.db, {
      userId: ctx.user.id,
      taskId: over,
      actual: 45,
    });
    expect(await ctx.balance()).toBe(70);
    // Settling again changes nothing.
    await settleCredits(ctx.db, {
      userId: ctx.user.id,
      taskId: over,
      actual: 45,
    });
    expect(await ctx.balance()).toBe(70);

    const failed = await ctx.task();
    await reserveCredits(ctx.db, {
      userId: ctx.user.id,
      taskId: failed,
      cap: 30,
      scope: "any",
      now,
    });
    expect(await new CreditsRepository(ctx.db).reserved(ctx.user.id)).toBe(30);
    await settleCredits(ctx.db, {
      userId: ctx.user.id,
      taskId: failed,
      actual: 0,
    });
    expect(await ctx.balance()).toBe(70);
    expect(await new CreditsRepository(ctx.db).reserved(ctx.user.id)).toBe(0);
  });

  it("prices usage with the margin and caps actions", () => {
    // 10k Sonnet input and 2.5k output: US$0.045, 1.5x, about 7 credits.
    expect(
      creditsForUsage([
        {
          model: "claude-sonnet-5-5",
          inputTokens: 10_000,
          outputTokens: 2_500,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      ])
    ).toBe(7);
    expect(creditCap("generate_document", { positions: 5 })).toBe(55);
    expect(
      creditCap("generate_document", {
        positions: 5,
        thorough: true,
        maximum: true,
      })
    ).toBe(220);
    expect(
      creditCap("generate_document", { documentKind: "cover_letter" })
    ).toBe(20);
    expect(creditCap("render_pdf")).toBe(0);
  });
});
