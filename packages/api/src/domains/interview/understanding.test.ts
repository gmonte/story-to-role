import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAiClient } from "@repo/api/domains/ai/ai-client";
import { CareerService } from "@repo/api/domains/career/career-service";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { InterviewRepository } from "./interview-repository";
import { InterviewService } from "./interview-service";
import { runUnderstandSession } from "./run-understand-session";

vi.mock("@repo/common/env/web.env", () => ({
  env: { ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}` },
}));

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const career = new CareerService(db);
  const trigger = {
    trigger: vi.fn(async () => ({ runId: "run", accessToken: "token" })),
  };
  const interview = new InterviewService(db, new TasksService(db, trigger));
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
  const { sessionId } = await interview.openSession({
    userId: user.id,
    positionId,
  });
  const cipher = await getUserCipher(db, user.id);

  const addDraft = (text: string) =>
    new InterviewRepository(db).insertDraft({
      sessionId,
      kind: "achievement",
      encryptedPayload: cipher.encrypt(JSON.stringify({ text })),
      encryptedQuote: cipher.encrypt(text),
      language: "en-US",
      lowDetail: false,
    });

  const understand = async (reply: string) => {
    const fake = fakeProviderPackage({ text: () => reply });
    await runUnderstandSession({
      db,
      ai: createAiClient({
        db,
        userId: user.id,
        funding: "credits",
        providerPackage: fake.providerPackage,
      }),
      cipher,
      userId: user.id,
      sessionId,
    });
    return fake;
  };

  return {
    db,
    user,
    career,
    interview,
    positionId,
    sessionId,
    addDraft,
    understand,
  };
}

describe("what the AI understood", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("summarizes a session's drafts and knows when it's stale", async () => {
    const ctx = await setup();
    await ctx.addDraft("Cut deploys from 2 hours to 15 minutes");

    const fake = await ctx.understand(
      "You cut deploys at Acme from 2 hours to 15 minutes."
    );

    // Written from the drafts only.
    const [request] = fake.generateText.mock.calls[0];
    expect(request.system).toContain("Cut deploys from 2 hours to 15 minutes");
    expect(request.system).toContain("Staff Engineer at Acme");
    expect(
      await ctx.interview.understanding({
        userId: ctx.user.id,
        sessionId: ctx.sessionId,
      })
    ).toEqual({
      text: "You cut deploys at Acme from 2 hours to 15 minutes.",
      pendingDrafts: 1,
      current: true,
    });

    // A new draft makes it stale until it's written again.
    await ctx.addDraft("Mentored five engineers");
    expect(
      await ctx.interview.understanding({
        userId: ctx.user.id,
        sessionId: ctx.sessionId,
      })
    ).toMatchObject({ pendingDrafts: 2, current: false });
  });

  it("goes stale when a draft is approved and another added", async () => {
    const ctx = await setup();
    const first = await ctx.addDraft("One");
    await ctx.understand("You did one thing.");
    await new InterviewRepository(ctx.db).updateDrafts([first.id], {
      status: "approved",
    });
    await ctx.addDraft("Two");

    expect(
      await ctx.interview.understanding({
        userId: ctx.user.id,
        sessionId: ctx.sessionId,
      })
    ).toMatchObject({ pendingDrafts: 1, current: false });
  });

  it("writes nothing for a session without drafts", async () => {
    const ctx = await setup();
    await expect(
      ctx.interview.understand({
        userId: ctx.user.id,
        sessionId: ctx.sessionId,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("stores the summary encrypted", async () => {
    const ctx = await setup();
    await ctx.addDraft("Led the Phoenix migration");
    await ctx.understand("You led the Phoenix migration.");

    const session = await new InterviewRepository(ctx.db).findSessionById(
      ctx.sessionId
    );
    expect(session?.encryptedUnderstanding).not.toContain("Phoenix");
  });

  it("counts the drafts each position has waiting for review", async () => {
    const ctx = await setup();
    await ctx.addDraft("One");
    await ctx.addDraft("Two");

    const timeline = await ctx.career.getTimeline({
      userId: ctx.user.id,
      defaultLanguage: "en-US",
    });
    expect(
      timeline.positions.find((position) => position.id === ctx.positionId)
        ?.draftsToReview
    ).toBe(2);
  });
});
