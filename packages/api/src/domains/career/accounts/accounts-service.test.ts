import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { CareerService } from "../career-service";
import {
  careerEventsTable,
  positionAccountVersionsTable,
} from "../db/career-tables";
import { AccountsService } from "./accounts-service";

vi.mock("@repo/common/env/web.env", () => ({
  env: { ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}` },
}));

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const career = new CareerService(db);
  await career.getOrCreateProfile({
    userId: user.id,
    defaultLanguage: "en-US",
  });
  await career.acceptPrivacyNotice(user.id);
  const { positionId } = await career.addPosition({
    userId: user.id,
    position: {
      employer: "Acme",
      title: "Staff Engineer",
      startDate: "2021-01",
    },
  });
  return { db, user, positionId, accounts: new AccountsService(db) };
}

describe("position accounts", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("keeps a draft apart until it is approved", async () => {
    const ctx = await setup();
    const owner = { userId: ctx.user.id, positionId: ctx.positionId };

    await ctx.accounts.saveDraft({
      ...owner,
      text: "I led the platform team of 6 [medido].",
      doNotInclude: ["Banco X"],
    });
    expect(await ctx.accounts.getAccount(owner)).toMatchObject({
      approved: null,
      draft: {
        text: "I led the platform team of 6 [medido].",
        doNotInclude: ["Banco X"],
      },
    });

    await ctx.accounts.approveDraft(owner);
    expect(await ctx.accounts.getAccount(owner)).toMatchObject({
      approved: { version: 1, text: "I led the platform team of 6 [medido]." },
      draft: null,
    });
    // The general chat hears of it, as context: it can't read accounts yet.
    const events = await ctx.db.select().from(careerEventsTable);
    expect(events.filter((event) => event.kind === "account_approved")).toEqual(
      [expect.objectContaining({ reactive: false })]
    );
  });

  it("numbers each approval and restores an earlier version as a draft", async () => {
    const ctx = await setup();
    const owner = { userId: ctx.user.id, positionId: ctx.positionId };
    await ctx.accounts.saveDraft({
      ...owner,
      text: "First.",
      doNotInclude: [],
    });
    await ctx.accounts.approveDraft(owner);
    await ctx.accounts.saveDraft({
      ...owner,
      text: "Second.",
      doNotInclude: [],
    });
    await ctx.accounts.approveDraft(owner);

    const { approved, versions } = await ctx.accounts.getAccount(owner);
    expect(approved).toMatchObject({ version: 2, text: "Second." });
    expect(versions.map((version) => version.version)).toEqual([2, 1]);

    const first = versions.find((version) => version.version === 1)!;
    expect(
      await ctx.accounts.getVersion({
        userId: ctx.user.id,
        accountVersionId: first.accountVersionId,
      })
    ).toMatchObject({ text: "First." });

    await ctx.accounts.restoreVersion({
      userId: ctx.user.id,
      accountVersionId: first.accountVersionId,
    });
    // Back as a draft: the account stays the second until approved.
    expect(await ctx.accounts.getAccount(owner)).toMatchObject({
      approved: { version: 2 },
      draft: { text: "First." },
    });
    await ctx.accounts.approveDraft(owner);
    expect((await ctx.accounts.getAccount(owner)).approved).toMatchObject({
      version: 3,
      text: "First.",
    });
  });

  it("keeps the text encrypted and away from other users", async () => {
    const ctx = await setup();
    const owner = { userId: ctx.user.id, positionId: ctx.positionId };
    await ctx.accounts.saveDraft({
      ...owner,
      text: "Led the Phoenix migration.",
      doNotInclude: ["Phoenix"],
    });
    const [row] = await ctx.db.select().from(positionAccountVersionsTable);
    expect(row?.encryptedText).not.toContain("Phoenix");
    expect(row?.encryptedDoNotInclude).not.toContain("Phoenix");

    const eve = await createTestUser("eve@example.com");
    await new CareerService(ctx.db).getOrCreateProfile({
      userId: eve.id,
      defaultLanguage: "en-US",
    });
    await expect(
      ctx.accounts.getAccount({ userId: eve.id, positionId: ctx.positionId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      ctx.accounts.getVersion({ userId: eve.id, accountVersionId: row.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
