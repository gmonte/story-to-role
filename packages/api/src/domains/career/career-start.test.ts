import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TrackerService } from "@repo/api/domains/applications/tracker/tracker-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

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

    expect(await career.startState(input)).toEqual({
      path: null,
      privacyNoticeAccepted: false,
      interviewLanguage: "pt-BR",
      hasStarted: false,
      hasOpening: false,
    });

    await career.chooseStart({ ...input, path: "opening" });
    expect((await career.startState(input)).path).toBe("opening");
  });

  it("knows a user who already has something has started", async () => {
    const db = await getTestDatabase();
    const user = await createTestUser();
    const career = new CareerService(db);
    const input = { userId: user.id, defaultLanguage: "en-US" as const };
    await career.startState(input);
    await new TrackerService(db).createExternal({
      userId: user.id,
      company: "Globex",
      title: "SRE",
      link: "https://example.com/jobs/1",
      status: "applied",
    });

    expect(await career.startState(input)).toMatchObject({
      hasStarted: true,
      hasOpening: true,
    });
  });
});
