import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { CareerRepository } from "./career-repository";
import { CareerService } from "./career-service";

vi.mock("@repo/common/env/web.env", () => ({
  env: { ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}` },
}));

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const career = new CareerService(db);
  const profile = await career.getOrCreateProfile({
    userId: user.id,
    defaultLanguage: "en-US",
  });
  const timeline = () =>
    career.getTimeline({ userId: user.id, defaultLanguage: "en-US" });
  return { db, user, career, profile, timeline };
}

describe("career profile", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("shows the profile and its sources, with decrypted file names", async () => {
    const ctx = await setup();
    expect(await ctx.timeline()).toEqual({
      profile: { interviewLanguage: "en-US", privacyNoticeAccepted: false },
      documents: [],
    });

    await ctx.career.acceptPrivacyNotice(ctx.user.id);
    const cipher = await getUserCipher(ctx.db, ctx.user.id);
    await new CareerRepository(ctx.db).insertDocument({
      profileId: ctx.profile.id,
      kind: "resume",
      encryptedFileName: cipher.encrypt("resume.pdf"),
      mimeType: "application/pdf",
      storageKey: "users/x/documents/y",
    });

    expect(await ctx.timeline()).toMatchObject({
      profile: { privacyNoticeAccepted: true },
      documents: [{ fileName: "resume.pdf" }],
    });
  });

  it("changes the career language", async () => {
    const ctx = await setup();
    await ctx.career.updateSettings({
      userId: ctx.user.id,
      interviewLanguage: "pt-BR",
    });
    expect((await ctx.timeline()).profile.interviewLanguage).toBe("pt-BR");
  });
});
