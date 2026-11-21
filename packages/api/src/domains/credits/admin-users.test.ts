import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AiKeysRepository } from "@repo/api/domains/ai/ai-keys-repository";
import { BillingRepository } from "@repo/api/domains/billing/billing-repository";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { CreditsService } from "./credits-service";

vi.mock("@repo/api/tools/trigger/trigger-client", () => ({
  triggerClient: { trigger: vi.fn() },
}));

const now = new Date("2026-11-20T12:00:00Z");

describe("admin users", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("lists users newest first with their plan, and a courtesy's key", async () => {
    const db = await getTestDatabase();
    const owner = await createTestUser("owner@example.com");
    const ada = await createTestUser("ada@example.com");
    await createTestUser("grace@example.com");
    const credits = new CreditsService(db);
    await credits.grantCourtesy({
      adminUserId: owner.id,
      email: "ada@example.com",
      monthlyCredits: 100,
      endsAt: null,
      now,
    });
    await new AiKeysRepository(db).upsert({
      userId: ada.id,
      encryptedKey: "encrypted",
      lastCharacters: "abcd",
      status: "active",
      now,
    });

    const page = await credits.adminUsers({ limit: 20, now });
    expect(page.total).toBe(3);
    expect(
      page.data.map((row) => [row.email, row.plan, row.keyStatus])
    ).toEqual([
      ["grace@example.com", "free", null],
      ["ada@example.com", "courtesy", "active"],
      ["owner@example.com", "free", null],
    ]);
  });

  it("pages users and finds them by name or email", async () => {
    const db = await getTestDatabase();
    for (const email of ["ada@example.com", "grace@example.com"]) {
      await createTestUser(email);
    }
    await createTestUser("linus@example.com");
    const credits = new CreditsService(db);

    const first = await credits.adminUsers({ limit: 2, now });
    expect(first.data.map((row) => row.email)).toEqual([
      "linus@example.com",
      "grace@example.com",
    ]);
    const second = await credits.adminUsers({
      limit: 2,
      now,
      cursor: first.nextCursor,
    });
    expect(second.data.map((row) => row.email)).toEqual(["ada@example.com"]);
    expect(second.nextCursor).toBeNull();

    const found = await credits.adminUsers({
      limit: 20,
      now,
      search: " GRACE ",
    });
    expect(found.total).toBe(1);
    expect(found.data.map((row) => row.email)).toEqual(["grace@example.com"]);
  });

  it("filters users by plan, telling the two subscriptions apart", async () => {
    const db = await getTestDatabase();
    const owner = await createTestUser("owner@example.com");
    const ada = await createTestUser("ada@example.com");
    const grace = await createTestUser("grace@example.com");
    await createTestUser("linus@example.com");
    const billing = new BillingRepository(db);
    const subscribe = (userId: string, plan: "credits" | "own_key") =>
      billing.upsertSubscription({
        userId,
        stripeSubscriptionId: `sub_${plan}`,
        plan,
        status: "active",
        interval: "month",
        currentPeriodStart: new Date("2026-11-01T00:00:00Z"),
        currentPeriodEnd: new Date("2026-12-01T00:00:00Z"),
        cancelAtPeriodEnd: false,
      });
    await subscribe(ada.id, "credits");
    await subscribe(grace.id, "own_key");
    const credits = new CreditsService(db);
    await credits.grantCourtesy({
      adminUserId: owner.id,
      email: "owner@example.com",
      monthlyCredits: 100,
      endsAt: null,
      now,
    });

    const plans = async (
      plan: "free" | "subscription" | "own_key" | "courtesy"
    ) =>
      (await credits.adminUsers({ limit: 20, now, plan })).data.map((row) => [
        row.email,
        row.plan,
      ]);
    expect(await plans("subscription")).toEqual([
      ["ada@example.com", "subscription"],
    ]);
    expect(await plans("own_key")).toEqual([["grace@example.com", "own_key"]]);
    expect(await plans("courtesy")).toEqual([
      ["owner@example.com", "courtesy"],
    ]);
    expect(await plans("free")).toEqual([["linus@example.com", "free"]]);
    const all = await credits.adminUsers({ limit: 20, now });
    expect(all.total).toBe(4);
  });
});
