import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AiKeysRepository } from "@repo/api/domains/ai/ai-keys-repository";
import { AiKeysService } from "@repo/api/domains/ai/ai-keys-service";
import { KeyUnusableError } from "@repo/api/domains/ai/providers/provider-package";
import { BillingRepository } from "@repo/api/domains/billing/billing-repository";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { grantCredits, spendableTotal } from "./credit-ledger";
import { CreditsService } from "./credits-service";
import { aiKeysTable } from "../ai/db/ai-tables";
import { tasksTable } from "../tasks/db/tasks-tables";

vi.mock("@repo/common/env/web.env", () => ({
  env: {
    ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}`,
  },
}));
vi.mock("@repo/api/tools/trigger/trigger-client", () => ({
  triggerClient: { trigger: vi.fn(), reportProgress: vi.fn() },
}));

const apiKey = "sk-ant-api03-test-key-0123456789abcdefWXYZ";
const fakeTrigger = () => ({
  trigger: vi.fn(async () => ({ runId: "run_1", accessToken: "token" })),
});

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser("ada@example.com", { credits: 0 });
  const owner = await createTestUser("owner@example.com", { credits: 0 });
  const fake = fakeProviderPackage({});
  const keys = new AiKeysService(db, () => fake.providerPackage);
  const credits = new CreditsService(db);
  const tasks = new TasksService(db, fakeTrigger());
  const courtesy = (monthlyCredits: number) =>
    credits.grantCourtesy({
      adminUserId: owner.id,
      email: "ada@example.com",
      monthlyCredits,
      endsAt: null,
    });
  const subscribe = async () => {
    const billing = new BillingRepository(db);
    const now = Date.now();
    await billing.upsertSubscription({
      userId: user.id,
      stripeSubscriptionId: "sub_1",
      status: "active",
      interval: "month",
      currentPeriodStart: new Date(now - 86_400_000),
      currentPeriodEnd: new Date(now + 29 * 86_400_000),
      cancelAtPeriodEnd: false,
    });
    await billing.recordPaidInvoice({
      stripeSubscriptionId: "sub_1",
      invoiceId: "in_1",
      periodStart: new Date(now - 86_400_000),
      periodEnd: new Date(now + 29 * 86_400_000),
    });
  };
  const funding = async (taskId: string) =>
    (await db.select().from(tasksTable)).find((row) => row.id === taskId)
      ?.funding;
  return { db, user, fake, keys, credits, tasks, courtesy, subscribe, funding };
}

describe("own keys and funding", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("keeps keys for the paid plan, encrypted, showing only their end", async () => {
    const ctx = await setup();
    await expect(
      ctx.keys.save({ userId: ctx.user.id, apiKey })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    await ctx.courtesy(0);
    await ctx.keys.save({ userId: ctx.user.id, apiKey });

    expect(await ctx.keys.get(ctx.user.id)).toMatchObject({
      lastCharacters: "WXYZ",
      status: "active",
    });
    const [row] = await ctx.db.select().from(aiKeysTable);
    expect(row.encryptedKey).not.toContain("sk-ant");
  });

  it("refuses a key the provider refuses", async () => {
    const ctx = await setup();
    await ctx.courtesy(0);
    ctx.fake.validateKey.mockRejectedValueOnce(new KeyUnusableError("refused"));

    await expect(
      ctx.keys.save({ userId: ctx.user.id, apiKey })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "refused" });
    expect(await ctx.keys.get(ctx.user.id)).toBeNull();
  });

  it("funds a courtesy user's tasks with their key first, reserving nothing", async () => {
    const ctx = await setup();
    await ctx.courtesy(100);
    await ctx.keys.save({ userId: ctx.user.id, apiKey });

    const { task } = await ctx.tasks.start({
      userId: ctx.user.id,
      type: "analyze_opening",
    });

    expect(await ctx.funding(task.id)).toBe("key");
    expect(await spendableTotal(ctx.db, ctx.user.id, "any", new Date())).toBe(
      100
    );
  });

  it("spends a subscriber's plan credits before their key", async () => {
    const ctx = await setup();
    await ctx.subscribe();
    // The paid plan through the subscription: a key is allowed.
    await ctx.keys.save({ userId: ctx.user.id, apiKey });

    const largest = { positions: 20, thorough: true, maximum: true };
    const first = await ctx.tasks.start({
      userId: ctx.user.id,
      type: "generate_document",
      hints: largest,
    });
    expect(await ctx.funding(first.task.id)).toBe("credits");

    // What is left of the 600 monthly credits can't cover it: the key pays.
    const second = await ctx.tasks.start({
      userId: ctx.user.id,
      type: "generate_document",
      hints: largest,
    });
    expect(await ctx.funding(second.task.id)).toBe("key");
  });

  it("asks before spending stored credits once the key ran out", async () => {
    const ctx = await setup();
    await ctx.courtesy(0);
    await grantCredits(ctx.db, {
      userId: ctx.user.id,
      source: "pack",
      amount: 300,
      origin: "pack:cs_1",
      expiresAt: null,
    });
    await ctx.keys.save({ userId: ctx.user.id, apiKey });
    await new AiKeysRepository(ctx.db).setStatus(
      ctx.user.id,
      "out_of_credit",
      new Date()
    );

    await expect(
      ctx.tasks.start({ userId: ctx.user.id, type: "analyze_opening" })
    ).rejects.toMatchObject({
      code: "PAYMENT_REQUIRED",
      cause: { needed: 3, available: 0, stored: 300 },
    });

    await ctx.credits.confirmStoredCredits(ctx.user.id);
    const { task } = await ctx.tasks.start({
      userId: ctx.user.id,
      type: "analyze_opening",
    });
    expect(await ctx.funding(task.id)).toBe("credits");
  });

  it("stops a key-funded task whose key runs out, charging nothing", async () => {
    const ctx = await setup();
    await ctx.courtesy(50);
    await ctx.keys.save({ userId: ctx.user.id, apiKey });
    const { task } = await ctx.tasks.start({
      userId: ctx.user.id,
      type: "analyze_opening",
    });

    await expect(
      runTask({ db: ctx.db, taskId: task.id, type: "analyze_opening" }, () =>
        Promise.reject(new KeyUnusableError("out_of_credit"))
      )
    ).rejects.toBeInstanceOf(KeyUnusableError);

    expect((await ctx.keys.get(ctx.user.id))?.status).toBe("out_of_credit");
    const [row] = await ctx.db.select().from(tasksTable);
    expect(row.errorMessage).toBe("key_out_of_credit");
    expect(await spendableTotal(ctx.db, ctx.user.id, "any", new Date())).toBe(
      50
    );
    const summary = await ctx.credits.summary(ctx.user.id);
    expect(summary.key).toMatchObject({
      status: "out_of_credit",
      paysNext: false,
    });
  });
});
