import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { EvidenceRepository } from "@repo/api/domains/evidence/evidence-repository";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { OverridesService } from "./overrides-service";

vi.mock("@repo/common/env/web.env", () => ({
  env: {
    ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}`,
  },
}));

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const career = new CareerRepository(db);
  await career.insertProfileIfMissing({
    userId: user.id,
    interviewLanguage: "en-US",
  });
  const profile = await career.findProfileByUserId(user.id);
  const cipher = await getUserCipher(db, user.id);
  const openings = new OpeningsRepository(db);
  const competitor = await openings.insertOpening({
    profileId: profile.id,
    kind: "posted",
  });
  const other = await openings.insertOpening({
    profileId: profile.id,
    kind: "posted",
  });
  // Normally used: the client's name appears.
  await new EvidenceRepository(db).insertSensitiveItems([
    {
      profileId: profile.id,
      kind: "client",
      encryptedOriginal: cipher.encrypt("Banco X"),
      choice: "use",
    },
  ]);
  const [item] = await new EvidenceRepository(db).listSensitiveItems(
    profile.id
  );
  const overrides = new OverridesService(db);
  // The filter generation applies comes from the published profile's
  // communication rules since P6 and no longer reads these overrides, so
  // they are checked as the service keeps them, per application.
  const overrideFor = async (openingId: string) =>
    (await overrides.list({ userId: user.id, openingId }))[0].override;
  return { db, user, item, competitor, other, overrideFor, overrides };
}

describe("per-application overrides", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("hides an item for one application only", async () => {
    const ctx = await setup();
    await ctx.overrides.set({
      userId: ctx.user.id,
      openingId: ctx.competitor.id,
      sensitiveItemId: ctx.item.id,
      choice: "exclude",
    });

    expect(await ctx.overrideFor(ctx.competitor.id)).toEqual({
      choice: "exclude",
      generalized: null,
    });
    expect(await ctx.overrideFor(ctx.other.id)).toBeNull();
  });

  it("generalizes with this application's wording, and goes back on removal", async () => {
    const ctx = await setup();
    await expect(
      ctx.overrides.set({
        userId: ctx.user.id,
        openingId: ctx.competitor.id,
        sensitiveItemId: ctx.item.id,
        choice: "generalize",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await ctx.overrides.set({
      userId: ctx.user.id,
      openingId: ctx.competitor.id,
      sensitiveItemId: ctx.item.id,
      choice: "generalize",
      generalized: "a large private bank",
    });
    expect(
      await ctx.overrides.list({
        userId: ctx.user.id,
        openingId: ctx.competitor.id,
      })
    ).toEqual([
      expect.objectContaining({
        original: "Banco X",
        choice: "use",
        override: { choice: "generalize", generalized: "a large private bank" },
      }),
    ]);

    await ctx.overrides.remove({
      userId: ctx.user.id,
      openingId: ctx.competitor.id,
      sensitiveItemId: ctx.item.id,
    });
    expect(await ctx.overrideFor(ctx.competitor.id)).toBeNull();
  });

  it("keeps other users' openings out of reach", async () => {
    const ctx = await setup();
    const other = await createTestUser("grace@example.com");
    await new CareerRepository(ctx.db).insertProfileIfMissing({
      userId: other.id,
      interviewLanguage: "en-US",
    });
    await expect(
      ctx.overrides.list({ userId: other.id, openingId: ctx.competitor.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
