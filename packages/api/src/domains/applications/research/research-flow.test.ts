import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAiClient } from "@repo/api/domains/ai/ai-client";
import { CareerService } from "@repo/api/domains/career/career-service";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { companyResearchTable } from "../db/research-tables";
import { ResearchRepository } from "./research-repository";
import { ResearchService } from "./research-service";
import { runResearchCompany } from "./run-research-company";

vi.mock("@repo/common/env/web.env", () => ({
  env: { ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}` },
}));

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const profile = await new CareerService(db, {
    start: vi.fn(),
  } as never).getOrCreateProfile({ userId: user.id, defaultLanguage: "en-US" });
  const cipher = await getUserCipher(db, user.id);
  const opening = await new OpeningsRepository(db).insertOpening({
    profileId: profile.id,
    kind: "posted",
    status: "analyzed",
    encryptedTitle: cipher.encrypt("Platform Engineer"),
    encryptedCompany: cipher.encrypt("Hooli"),
  });
  const trigger = {
    trigger: vi.fn(async () => ({ runId: "run", accessToken: "t" })),
  };
  const research = new ResearchService(db, new TasksService(db, trigger));
  const run = async (facts: Array<{ text: string; source_url: string }>) => {
    const latest = await new ResearchRepository(db).latestResearch(opening.id);
    const fake = fakeProviderPackage({
      search: () => ({
        text: "Hooli builds search and video products and opened a Lisbon office in 2026.",
        sources: [
          { url: "https://hooli.example/about", title: "About Hooli" },
          {
            url: "https://news.example/hooli-lisbon",
            title: "Hooli in Lisbon",
          },
        ],
      }),
      object: () => ({ facts }),
    });
    await runResearchCompany({
      db,
      ai: createAiClient({
        db,
        userId: user.id,
        funding: "credits",
        providerPackage: fake.providerPackage,
      }),
      cipher,
      userId: user.id,
      researchId: latest.id,
    });
    return fake;
  };
  return { db, user, opening, research, trigger, run };
}

describe("company research", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("keeps sourced facts, lets the user select them, and keeps selected ones on a new run", async () => {
    const ctx = await setup();
    const read = () =>
      ctx.research.get({ userId: ctx.user.id, openingId: ctx.opening.id });
    expect(await read()).toEqual({ status: null, facts: [] });

    await ctx.research.start({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    expect(ctx.trigger.trigger).toHaveBeenLastCalledWith(
      "research_company",
      expect.anything()
    );
    expect((await read()).status).toBe("researching");
    // One run at a time.
    await expect(
      ctx.research.start({ userId: ctx.user.id, openingId: ctx.opening.id })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const fake = await ctx.run([
      {
        text: "Hooli builds search and video products.",
        source_url: "https://hooli.example/about",
      },
      {
        text: "Hooli opened a Lisbon office in 2026.",
        source_url: "https://news.example/hooli-lisbon",
      },
      // Not a page the search returned: dropped.
      {
        text: "Hooli is hiring 500 engineers.",
        source_url: "https://made.up/",
      },
    ]);
    // The search runs with the provider's web search, within the limit.
    expect(fake.searchWeb.mock.calls[0][0]).toMatchObject({ maxSearches: 5 });
    const done = await read();
    expect(done.status).toBe("done");
    expect(
      done.facts.map((fact) => [fact.text, fact.sourceTitle, fact.approved])
    ).toEqual([
      ["Hooli builds search and video products.", "About Hooli", false],
      ["Hooli opened a Lisbon office in 2026.", "Hooli in Lisbon", false],
    ]);

    await ctx.research.selectFacts({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      companyFactIds: [done.facts[1].id],
    });
    expect((await read()).facts.map((fact) => fact.approved)).toEqual([
      false,
      true,
    ]);

    // A new run replaces unselected facts and keeps the selected one.
    await ctx.research.start({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    await ctx.run([
      {
        text: "Hooli's mission is to make the world a better place.",
        source_url: "https://hooli.example/about",
      },
    ]);
    expect(
      (await read()).facts.map((fact) => [fact.text, fact.approved])
    ).toEqual([
      ["Hooli opened a Lisbon office in 2026.", true],
      ["Hooli's mission is to make the world a better place.", false],
    ]);
  });

  it("refuses another user's opening and lets a dead run be replaced", async () => {
    const ctx = await setup();
    const stranger = await createTestUser("eve@example.com");
    await new CareerService(ctx.db, {
      start: vi.fn(),
    } as never).getOrCreateProfile({
      userId: stranger.id,
      defaultLanguage: "en-US",
    });
    await expect(
      ctx.research.start({ userId: stranger.id, openingId: ctx.opening.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await ctx.research.start({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    // A run whose worker died long ago shows as failed and blocks nothing.
    await ctx.db
      .update(companyResearchTable)
      .set({ createdAt: new Date(Date.now() - 10 * 60_000) });
    expect(
      (
        await ctx.research.get({
          userId: ctx.user.id,
          openingId: ctx.opening.id,
        })
      ).status
    ).toBe("failed");
    await expect(
      ctx.research.start({ userId: ctx.user.id, openingId: ctx.opening.id })
    ).resolves.toBeDefined();
  });
});
