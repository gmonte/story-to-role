import { randomBytes } from "node:crypto";

import type { TranscriptStorage } from "@trigger.dev/sdk/ai";
import { runTranscriptStorageTests } from "@trigger.dev/sdk/ai/test";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { CareerChatRepository } from "./career-chat-repository";
import { createCareerTranscriptStorage } from "./career-transcript-storage";

vi.mock("@repo/common/env/web.env", () => ({
  env: {
    ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}`,
  },
}));

async function newChat(email = "ada@example.com") {
  const db = await getTestDatabase();
  const user = await createTestUser(email);
  const career = new CareerRepository(db);
  await career.insertProfileIfMissing({
    userId: user.id,
    interviewLanguage: "en-US",
  });
  const profile = await career.findProfileByUserId(user.id);
  const chat = await new CareerChatRepository(db).insertChat({
    profileId: profile.id,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  return { db, chatId: chat.id };
}

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await closeTestDatabase();
});

/**
 * The SDK's conformance suite names its own chats; each name gets a real
 * career chat of its own, since ours are profile rows keyed by uuid.
 */
runTranscriptStorageTests(
  async () => {
    const db = await getTestDatabase();
    const storage = createCareerTranscriptStorage(db);
    const ids = new Map<string, string>();
    let users = 0;
    const real = async (chatId: string) => {
      if (!ids.has(chatId)) {
        ids.set(chatId, (await newChat(`user${users++}@example.com`)).chatId);
      }
      return ids.get(chatId)!;
    };
    const mapped: TranscriptStorage = {
      load: async (scope, opts) =>
        storage.load({ ...scope, chatId: await real(scope.chatId) }, opts),
      save: async (ctx, changeset) =>
        storage.save({ ...ctx, chatId: await real(ctx.chatId) }, changeset),
    };
    return mapped;
  },
  { api: { describe, it, expect } }
);

describe("career transcript storage", () => {
  it("keeps every message encrypted at rest", async () => {
    const { db, chatId } = await newChat();
    const storage = createCareerTranscriptStorage(db);
    const message = {
      id: "m1",
      role: "user" as const,
      parts: [{ type: "text" as const, text: "I led the Phoenix migration" }],
    };
    await storage.save(
      {
        chatId,
        clientData: undefined,
        turn: 0,
        trigger: "submit-message",
        runId: "run",
        ctx: {} as never,
      },
      {
        reason: "turn-complete",
        changes: [{ op: "put", message }],
        transcript: { entries: [], state: null },
      }
    );

    const [row] = await new CareerChatRepository(db).listMessages(chatId);
    expect(row?.encryptedMessage).not.toContain("Phoenix");
    const loaded = await storage.load({ chatId, clientData: undefined });
    expect(loaded.messages).toEqual([message]);
  });

  it("knows no chat that isn't a career chat", async () => {
    const db = await getTestDatabase();
    const storage = createCareerTranscriptStorage(db);
    expect(
      await storage.load({
        chatId: "00000000-0000-4000-8000-000000000000",
        clientData: undefined,
      })
    ).toEqual({ messages: [], state: null });
  });
});
