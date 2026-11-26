import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { appliedOpening } from "@repo/api/test/applied-opening";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";

import { CareerService } from "./career-service";

vi.mock("@repo/common/env/web.env", () => ({
  env: {
    ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}`,
  },
}));
vi.mock("@repo/api/tools/trigger/trigger-client", () => ({
  triggerClient: { trigger: vi.fn() },
}));

describe("onboarding start", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("asks a new user how to start, then remembers the path", async () => {
    const db = await getTestDatabase();
    const user = await createTestUser();
    const career = new CareerService(db);
    const input = { userId: user.id, defaultLanguage: "pt-BR" as const };

    expect(await career.startState(user.id)).toEqual({
      path: null,
      hasStarted: false,
      hasOpening: false,
      hasPublishedProfile: false,
    });

    await career.chooseStart({ ...input, path: "opening" });
    expect((await career.startState(user.id)).path).toBe("opening");
    await career.chooseStart({ ...input, path: "career" });
    expect((await career.startState(user.id)).path).toBe("career");
  });

  it("counts an opening added the usual way", async () => {
    const db = await getTestDatabase();
    const user = await createTestUser();
    const career = new CareerService(db);
    const profile = await career.getOrCreateProfile({
      userId: user.id,
      defaultLanguage: "en-US",
    });
    await new OpeningsRepository(db).insertOpening({
      profileId: profile.id,
      kind: "posted",
    });
    expect(await career.startState(user.id)).toMatchObject({
      hasStarted: true,
      hasOpening: true,
    });
  });

  it("knows a user who already has something has started", async () => {
    const db = await getTestDatabase();
    const user = await createTestUser();
    const career = new CareerService(db);
    const input = { userId: user.id, defaultLanguage: "en-US" as const };
    await career.getOrCreateProfile(input);
    expect(await career.startState(user.id)).toMatchObject({
      hasStarted: false,
    });
    const profile = await career.getOrCreateProfile(input);
    await appliedOpening({
      userId: user.id,
      profileId: profile.id,
      title: "SRE",
      appliedAt: new Date(),
    });

    expect(await career.startState(user.id)).toMatchObject({
      hasStarted: true,
      hasOpening: true,
    });
  });
});
