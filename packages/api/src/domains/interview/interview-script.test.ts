import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { CreditsService } from "@repo/api/domains/credits/credits-service";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { InterviewService } from "./interview-service";

vi.mock("@repo/common/env/web.env", () => ({
  env: {
    ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}`,
  },
}));
vi.mock("@repo/api/tools/trigger/trigger-client", () => ({
  triggerClient: { trigger: vi.fn() },
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
  await career.updateProfile(profile.id, {
    privacyNoticeAcceptedAt: new Date(),
  });
  const cipher = await getUserCipher(db, user.id);
  // A recent position: outside the Free plan it gets the full script.
  const position = await career.insertPosition({
    profileId: profile.id,
    encryptedEmployer: cipher.encrypt("Initech"),
    encryptedTitle: cipher.encrypt("Platform Engineer"),
    startDate: "2023-01",
    status: "pending",
    origin: "manual",
  });
  const interview = new InterviewService(db);
  const scriptOf = async () => {
    const { sessionId } = await interview.openSession({
      userId: user.id,
      positionId: position.id,
    });
    return (await interview.getSession({ userId: user.id, sessionId }))
      .scriptKind;
  };
  return { db, user, scriptOf };
}

describe("interview script", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("suggests the short script on the Free plan", async () => {
    const ctx = await setup();
    expect(await ctx.scriptOf()).toBe("short");
  });

  it("uses the full script for a recent position on the paid plan", async () => {
    const ctx = await setup();
    const owner = await createTestUser("owner@example.com", { credits: 0 });
    await new CreditsService(ctx.db).grantCourtesy({
      adminUserId: owner.id,
      email: ctx.user.email,
      monthlyCredits: 100,
      endsAt: null,
    });
    expect(await ctx.scriptOf()).toBe("full");
  });
});
