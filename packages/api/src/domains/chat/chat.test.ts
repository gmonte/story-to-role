import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAiClient } from "@repo/api/domains/ai/ai-client";
import { aiUsageTable } from "@repo/api/domains/ai/db/ai-tables";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { ChatService } from "./chat-service";
import { chatMessagesTable } from "./db/chat-tables";
import { runChatTurn } from "./run-chat-turn";

vi.mock("@repo/common/env/web.env", () => ({
  env: {
    ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}`,
  },
}));

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const trigger = {
    trigger: vi.fn(async () => ({ runId: "run_1", accessToken: "token" })),
  };
  const chat = new ChatService(db, new TasksService(db, trigger));
  return { db, user, chat, trigger };
}

describe("chat", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("stores the message encrypted and starts its turn with only ids", async () => {
    const { db, user, chat, trigger } = await setup();

    const { message } = await chat.send({
      userId: user.id,
      context: "career_interview",
      message: "At Acme I cut cloud costs by 40%",
    });

    const [row] = await db.select().from(chatMessagesTable);
    expect(row.encryptedContent).not.toContain("Acme");
    const [taskIdentifier, payload] = trigger.trigger.mock
      .calls[0] as unknown as [string, Record<string, unknown>];
    expect(taskIdentifier).toBe("chat_turn");
    expect(Object.keys(payload)).toEqual(["taskId"]);
    expect(
      await chat.list({ userId: user.id, context: "career_interview" })
    ).toEqual([
      expect.objectContaining({
        id: message.id,
        author: "user",
        content: "At Acme I cut cloud costs by 40%",
      }),
    ]);
  });

  it("gives an off-topic message the fixed reply without calling the main model", async () => {
    const { db, user, chat } = await setup();
    const { message } = await chat.send({
      userId: user.id,
      context: "career_interview",
      message: "Write me a poem about pizza",
    });
    const { providerPackage, generateText } = fakeProviderPackage({
      object: () => ({ verdict: "off_topic" }),
    });
    const ai = createAiClient({
      db,
      userId: user.id,
      funding: "credits",
      providerPackage,
    });

    await runChatTurn({ db, ai, userId: user.id, chatMessageId: message.id });

    expect(generateText).not.toHaveBeenCalled();
    const messages = await chat.list({
      userId: user.id,
      context: "career_interview",
    });
    expect(messages.at(-1)).toMatchObject({
      author: "assistant",
      kind: "off_topic",
      content: null,
    });
    const calls = await db.select().from(aiUsageTable);
    expect(calls.map((call) => call.purpose)).toEqual(["topic_gate"]);
  });

  it("answers an on-topic message and stores the answer encrypted", async () => {
    const { db, user, chat } = await setup();
    const { message } = await chat.send({
      userId: user.id,
      context: "career_interview",
      message: "I led a team of five at Acme",
    });
    const { providerPackage } = fakeProviderPackage({
      object: () => ({ verdict: "on_topic" }),
      text: () => "Tell me about the team you led.",
    });
    const ai = createAiClient({
      db,
      userId: user.id,
      funding: "credits",
      providerPackage,
    });

    await runChatTurn({ db, ai, userId: user.id, chatMessageId: message.id });

    const rows = await db.select().from(chatMessagesTable);
    expect(rows.at(-1)?.encryptedContent).not.toContain("team");
    const messages = await chat.list({
      userId: user.id,
      context: "career_interview",
    });
    expect(messages.at(-1)).toMatchObject({
      author: "assistant",
      kind: "text",
      content: "Tell me about the team you led.",
    });
  });
});
