import { randomBytes } from "node:crypto";

import { streamText, type LanguageModel } from "ai";
import { eq } from "drizzle-orm";
import { MockLanguageModelV3 } from "ai/test";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CareerService } from "@repo/api/domains/career/career-service";
import { recordCareerEvent } from "@repo/api/domains/career/record-career-event";
import { EvidenceRepository } from "@repo/api/domains/evidence/evidence-repository";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { InterviewRepository } from "@repo/api/domains/interview/interview-repository";
import { creditEntriesTable } from "@repo/api/domains/credits/db/credits-tables";
import { tasksTable } from "@repo/api/domains/tasks/db/tasks-tables";
import { createTestUser } from "@repo/api/test/create-test-user";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";
import type { MisuseGuard } from "@repo/api/tools/misuse-guard";

import { CareerChatService } from "./career-chat-service";
import {
  markCareerChangesSeen,
  pendingCareerChanges,
  reactToCareerChanges,
} from "./career-changes";
import { withoutReasoning } from "./chat-history";
import { runCareerChatTurn } from "./run-career-chat-turn";

vi.mock("@repo/common/env/web.env", () => ({
  env: {
    ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}`,
    ANTHROPIC_API_KEY: "test-key",
  },
}));

// The position agents' provider: scripted, no network.
let positionAgents: ReturnType<typeof fakeProviderPackage>;
vi.mock(
  "@repo/api/domains/ai/providers/anthropic-package",
  async (original) => ({
    ...(await original<object>()),
    createAnthropicPackage: () => positionAgents.providerPackage,
  })
);

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

/** The orchestrator: first it consults the given targets, then it answers. */
function orchestrator(
  calls: Array<{ kind: string; targetId?: string }>,
  answer: string
) {
  let step = 0;
  return new MockLanguageModelV3({
    doStream: () => {
      const parts =
        step++ === 0 && calls.length > 0
          ? [
              ...calls.map((input, index) => ({
                type: "tool-call" as const,
                toolCallId: `call-${index}`,
                toolName: "consult_interviewer",
                input: JSON.stringify(input),
              })),
              {
                type: "finish" as const,
                finishReason: {
                  unified: "tool-calls" as const,
                  raw: "tool_use",
                },
                usage,
              },
            ]
          : [
              { type: "text-start" as const, id: "t" },
              { type: "text-delta" as const, id: "t", delta: answer },
              { type: "text-end" as const, id: "t" },
              {
                type: "finish" as const,
                finishReason: { unified: "stop" as const, raw: "end_turn" },
                usage,
              },
            ];
      return Promise.resolve({
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      });
    },
  });
}

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const career = new CareerService(db);
  await career.getOrCreateProfile({
    userId: user.id,
    defaultLanguage: "en-US",
  });
  await career.acceptPrivacyNotice(user.id);
  const acme = await career.addPosition({
    userId: user.id,
    position: {
      employer: "Acme",
      title: "Staff Engineer",
      startDate: "2021-01",
    },
  });
  const globex = await career.addPosition({
    userId: user.id,
    position: { employer: "Globex", title: "Engineer", startDate: "2017-03" },
  });
  const { chatId } = await new CareerChatService(db).current(user.id);
  const misuse: MisuseGuard = {
    isCoolingDown: async () => false,
    recordBlocked: async () => undefined,
  };
  const reported: string[][] = [];

  async function say(text: string, model: LanguageModel) {
    const { result, turn } = await runCareerChatTurn(
      {
        db,
        misuse,
        streamText,
        model: () => model,
        reportAgents: (working) => reported.push(working),
      },
      { chatId, messages: [{ role: "user", content: text }] }
    );
    return { text: await result.text, turn };
  }

  return {
    db,
    user,
    chatId,
    acme: acme.positionId,
    globex: globex.positionId,
    say,
    reported,
  };
}

describe("career chat", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("hands one message about two positions to both interviewers", async () => {
    const ctx = await setup();
    const message =
      "At Acme I led the platform team, and at Globex I built the billing API.";
    positionAgents = fakeProviderPackage({
      object: () => ({ verdict: "on_topic" }),
      agent: async (request, callTool) => {
        // The interviewer of the position the prompt is about.
        const atAcme = request.system.includes(
          `this position (id ${ctx.acme})`
        );
        await callTool("save_draft_fact", {
          kind: "achievement",
          text: atAcme ? "Led the platform team" : "Built the billing API",
          quote: atAcme ? "led the platform team" : "built the billing API",
        });
        return atAcme ? "How big was the team?" : "Who used the API?";
      },
    });

    const { text, turn } = await ctx.say(
      message,
      orchestrator(
        [
          { kind: "position", targetId: ctx.acme },
          { kind: "position", targetId: ctx.globex },
        ],
        "How big was the platform team at Acme?"
      )
    );

    expect(text).toBe("How big was the platform team at Acme?");
    const interview = new InterviewRepository(ctx.db);
    const cipher = await getUserCipher(ctx.db, ctx.user.id);
    const profile = await new CareerService(ctx.db).requireProfile(ctx.user.id);
    const sessions = await interview.listSessions(profile.id);
    const drafts = await Promise.all(
      sessions.map(async (session) => ({
        positionId: session.positionId,
        texts: (await interview.listDrafts(session.id)).map(
          (draft) =>
            (
              JSON.parse(cipher.decrypt(draft.encryptedPayload)) as {
                text: string;
              }
            ).text
        ),
      }))
    );
    expect(drafts).toEqual(
      expect.arrayContaining([
        { positionId: ctx.acme, texts: ["Led the platform team"] },
        { positionId: ctx.globex, texts: ["Built the billing API"] },
      ])
    );
    // Both interviewers showed as working at once.
    expect(ctx.reported.some((working) => working.length === 2)).toBe(true);
    expect(ctx.reported.at(-1)).toEqual([]);
    // The turn holds a reservation, settled when the agent completes it.
    expect(turn?.funding).toBe("credits");
  });

  it("keeps the career's language whatever the chat is in, then locks it", async () => {
    const ctx = await setup();
    const career = new CareerService(ctx.db);
    const language = async () =>
      (await new CareerRepository(ctx.db).findProfileByUserId(ctx.user.id))
        ?.interviewLanguage;

    // A message in another language only changes the conversation's.
    await ctx.say(
      "Eu trabalhei na Acme por três anos",
      orchestrator([], "Conte mais.")
    );
    expect(await language()).toBe("en-US");

    // Before any evidence the user may still pick another one; after, no.
    await career.updateSettings({
      userId: ctx.user.id,
      interviewLanguage: "pt-BR",
    });
    expect(await language()).toBe("pt-BR");
    const profile = await new CareerRepository(ctx.db).findProfileByUserId(
      ctx.user.id
    );
    await new EvidenceRepository(ctx.db).insertEvidence([
      {
        profileId: profile.id,
        positionId: ctx.acme,
        kind: "achievement",
        encryptedText: "x",
        language: "en-US",
        encryptedSourceQuote: "x",
        approvedAt: new Date(),
      },
    ]);
    await expect(
      career.updateSettings({ userId: ctx.user.id, interviewLanguage: "en-US" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("knows what the user changed on the side panel on its next turn", async () => {
    const ctx = await setup();
    await new CareerService(ctx.db).mergePositions({
      userId: ctx.user.id,
      positionId: ctx.globex,
      intoPositionId: ctx.acme,
    });
    // A merge is context only: nothing to say by itself.
    expect(await pendingCareerChanges(ctx.db, ctx.chatId)).toBeNull();

    const model = orchestrator([], "Got it.");
    await ctx.say("Hi", model);
    expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).toContain(
      "merged Engineer at Globex into Staff Engineer at Acme"
    );

    // Taken in once.
    const next = orchestrator([], "Sure.");
    await ctx.say("And now?", next);
    expect(JSON.stringify(next.doStreamCalls[0]?.prompt)).not.toContain(
      "merged Engineer at Globex"
    );
  });

  it("reacts by itself to a change that moves the next step", async () => {
    const ctx = await setup();
    const profile = await new CareerRepository(ctx.db).findProfileByUserId(
      ctx.user.id
    );
    await recordCareerEvent(ctx.db, {
      userId: ctx.user.id,
      profileId: profile.id,
      kind: "facts_approved",
      summary: "reviewed Staff Engineer at Acme: approved 5 of 6 facts",
    });

    const pending = await pendingCareerChanges(ctx.db, ctx.chatId);
    // With what came before it (the positions added by hand).
    expect(pending?.summaries.at(-1)).toBe(
      "reviewed Staff Engineer at Acme: approved 5 of 6 facts"
    );
    const model = orchestrator([], "Nice, Acme is in. Globex next?");
    const { result, funding } = await reactToCareerChanges(
      { db: ctx.db, streamText, model: () => model },
      { pending: pending!, messages: [] }
    );
    expect(await result.text).toBe("Nice, Acme is in. Globex next?");
    // Not the user's credits: StoryToRole's key without one of their own.
    expect(funding).toBe("credits");
    expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).toContain(
      "approved 5 of 6 facts"
    );

    await markCareerChangesSeen(ctx.db, pending!.careerEventIds);
    expect(await pendingCareerChanges(ctx.db, ctx.chatId)).toBeNull();
  });

  it("answers an off-topic message from code, calling no interviewer", async () => {
    const ctx = await setup();
    positionAgents = fakeProviderPackage({
      object: () => ({ verdict: "off_topic" }),
    });
    const model = orchestrator([], "should not be called");

    const { text } = await ctx.say("Write me a poem about the sea", model);

    expect(text).toMatch(/career story/);
    expect(model.doStreamCalls).toHaveLength(0);
    expect(positionAgents.runAgent).not.toHaveBeenCalled();
  });

  it("reserves nothing and says so when the user is out of credits", async () => {
    const db = await getTestDatabase();
    const user = await createTestUser("broke@example.com", { credits: 0 });
    const career = new CareerService(db);
    await career.getOrCreateProfile({
      userId: user.id,
      defaultLanguage: "en-US",
    });
    await career.acceptPrivacyNotice(user.id);
    const { chatId } = await new CareerChatService(db).current(user.id);
    const model = orchestrator([], "should not be called");

    const { result, turn } = await runCareerChatTurn(
      {
        db,
        misuse: {
          isCoolingDown: async () => false,
          recordBlocked: async () => undefined,
        },
        streamText,
        model: () => model,
        reportAgents: () => undefined,
      },
      { chatId, messages: [{ role: "user", content: "Hi" }] }
    );

    expect(await result.text).toMatch(/out of credits/);
    expect(turn).toBeNull();
    expect(await db.select().from(tasksTable)).toHaveLength(0);
  });

  it("settles the turn as failed when it breaks after reserving", async () => {
    const ctx = await setup();
    positionAgents = fakeProviderPackage({
      object: () => ({ verdict: "on_topic" }),
    });
    const broken: MisuseGuard = {
      isCoolingDown: () => Promise.reject(new Error("redis down")),
      recordBlocked: async () => undefined,
    };

    await expect(
      runCareerChatTurn(
        {
          db: ctx.db,
          misuse: broken,
          streamText,
          model: () => orchestrator([], "unused"),
          reportAgents: () => undefined,
        },
        { chatId: ctx.chatId, messages: [{ role: "user", content: "Hi" }] }
      )
    ).rejects.toThrow("redis down");

    const [task] = await ctx.db.select().from(tasksTable);
    expect(task?.status).toBe("failed");
    // The reservation was released: the turn's entries net to nothing.
    const entries = await ctx.db
      .select()
      .from(creditEntriesTable)
      .where(eq(creditEntriesTable.taskId, task.id));
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.reduce((sum, entry) => sum + entry.amount, 0)).toBe(0);
  });

  it("sends earlier answers without their reasoning blocks", () => {
    expect(
      withoutReasoning([
        { role: "user", content: "At Acme I led the team" },
        {
          role: "assistant",
          content: [
            { type: "reasoning", text: "thinking…" },
            { type: "text", text: "How big was it?" },
          ],
        },
      ])
    ).toEqual([
      { role: "user", content: "At Acme I led the team" },
      {
        role: "assistant",
        content: [{ type: "text", text: "How big was it?" }],
      },
    ]);
  });

  it("never opens another user's chat", async () => {
    const ctx = await setup();
    const stranger = await createTestUser("eve@example.com");
    const { chatId } = await new CareerChatService(ctx.db).current(ctx.user.id);
    await expect(
      new CareerChatService(ctx.db).requireOwn({ userId: stranger.id, chatId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
