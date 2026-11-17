import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";

import { grantCredits, reserveCredits, spendableTotal } from "./credit-ledger";
import { creditCap } from "./credit-pricing";
import { CreditsService } from "./credits-service";
import { creditLotsTable } from "./db/credits-tables";

vi.mock("@repo/api/tools/trigger/trigger-client", () => ({
  triggerClient: { trigger: vi.fn() },
}));

const now = new Date("2026-11-15T12:00:00Z");

async function setup(credits = 0) {
  const db = await getTestDatabase();
  const user = await createTestUser("ada@example.com", { credits });
  return { db, user, credits: new CreditsService(db) };
}

describe("credits service", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("shows the balance by source and expiry, with the month's fit-check credits", async () => {
    const ctx = await setup();
    await grantCredits(ctx.db, {
      userId: ctx.user.id,
      source: "welcome",
      amount: 200,
      origin: `welcome:${ctx.user.id}`,
      expiresAt: null,
    });

    const summary = await ctx.credits.summary(ctx.user.id, now);

    expect(summary.available).toBe(210);
    expect(summary.lots).toEqual([
      {
        source: "monthly_free",
        scope: "fit_check",
        remaining: 10,
        expiresAt: new Date("2026-12-01T00:00:00Z"),
      },
      { source: "welcome", scope: "any", remaining: 200, expiresAt: null },
    ]);
    // Free, no resume yet: the resume is kept.
    expect(summary.reserve).toBe(
      creditCap("generate_document", { positions: 0 })
    );
    expect(summary.courtesy).toBeNull();
  });

  it("grants a courtesy plan, replaces it, and ends it with its credits", async () => {
    const ctx = await setup();
    const admin = await createTestUser("owner@example.com", { credits: 0 });

    await ctx.credits.grantCourtesy({
      adminUserId: admin.id,
      email: "ADA@example.com",
      monthlyCredits: 300,
      endsAt: null,
      now,
    });
    let summary = await ctx.credits.summary(ctx.user.id, now);
    expect(summary.courtesy).toEqual({ monthlyCredits: 300, endsAt: null });
    expect(summary.reserve).toBe(0);
    expect(summary.available).toBe(300);

    await ctx.credits.grantCourtesy({
      adminUserId: admin.id,
      email: "ada@example.com",
      monthlyCredits: 50,
      endsAt: new Date("2027-01-01T00:00:00Z"),
      now,
    });
    const grants = await ctx.credits.listCourtesyGrants();
    expect(grants).toHaveLength(2);
    expect(grants.filter((grant) => !grant.endedAt)).toHaveLength(1);
    summary = await ctx.credits.summary(ctx.user.id, now);
    // The replaced grant's credits ended with it.
    expect(summary.available).toBe(50);

    const active = grants.find((grant) => !grant.endedAt)!;
    await ctx.credits.endCourtesy({ courtesyGrantId: active.id, now });
    summary = await ctx.credits.summary(ctx.user.id, now);
    // Back to Free: only its fit-check credits.
    expect(summary.courtesy).toBeNull();
    expect(summary.available).toBe(10);
  });

  it("reconciles without duplicating a grant and restores a missing one", async () => {
    const ctx = await setup();
    await createTestUser("grace@example.com", { credits: 0 });

    expect(await ctx.credits.reconcile(now)).toEqual({
      users: 2,
      granted: 2,
      settled: 0,
    });
    expect(await ctx.credits.reconcile(now)).toEqual({
      users: 2,
      granted: 0,
      settled: 0,
    });
    expect(await spendableTotal(ctx.db, ctx.user.id, "any", now)).toBe(200);

    // A restore that lost a grant: reconciliation brings it back.
    await ctx.db.delete(creditLotsTable);
    expect(await ctx.credits.reconcile(now)).toEqual({
      users: 2,
      granted: 2,
      settled: 0,
    });
    expect(await spendableTotal(ctx.db, ctx.user.id, "any", now)).toBe(200);
  });

  it("keeps stored credits off the courtesy plan until the user confirms", async () => {
    const ctx = await setup(500);
    const admin = await createTestUser("owner@example.com", { credits: 0 });
    await ctx.credits.grantCourtesy({
      adminUserId: admin.id,
      email: "ada@example.com",
      monthlyCredits: 20,
      endsAt: null,
      now,
    });

    expect(await spendableTotal(ctx.db, ctx.user.id, "any", now)).toBe(20);
  });

  it("never lets an ended courtesy grant's credits come back", async () => {
    const ctx = await setup();
    const admin = await createTestUser("owner@example.com", { credits: 0 });
    await ctx.credits.grantCourtesy({
      adminUserId: admin.id,
      email: "ada@example.com",
      monthlyCredits: 100,
      endsAt: null,
      now,
    });
    const task = await new TasksRepository(ctx.db).create({
      userId: ctx.user.id,
      type: "generate_document",
    });
    await reserveCredits(ctx.db, {
      userId: ctx.user.id,
      taskId: task.id,
      cap: 60,
      scope: "any",
      now,
    });
    const [grant] = await ctx.credits.listCourtesyGrants();
    await ctx.credits.endCourtesy({ courtesyGrantId: grant.id, now });

    // The task dies; reconciliation releases its reservation later.
    await new TasksRepository(ctx.db).markFailed({
      taskId: task.id,
      errorMessage: "killed",
    });
    expect((await ctx.credits.reconcile(now)).settled).toBe(1);
    // Only the welcome credits reconciliation granted: none of the 100.
    expect(await spendableTotal(ctx.db, ctx.user.id, "any", now)).toBe(200);
  });
});
