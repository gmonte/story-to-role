import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { createAiClient } from "./ai-client";
import { aiUsageTable } from "./db/ai-tables";
import type { ProviderPackage } from "./providers/provider-package";
import { replyToChatMessage } from "./topic-gate";

const usage = {
  model: "claude-haiku-5-5",
  inputTokens: 120,
  outputTokens: 8,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

function fakePackage(verdict: () => Promise<unknown>) {
  const generateObject = vi.fn(async () => ({
    object: (await verdict()) as never,
    usage,
  }));
  const providerPackage: ProviderPackage = {
    provider: "anthropic",
    models: {
      classification: "claude-haiku-5-5",
      writing: "claude-sonnet-5-5",
      maximum: "claude-opus-5-5",
    },
    generateText: vi.fn(async () => ({ text: "", usage })),
    generateObject,
  };
  return { providerPackage, generateObject };
}

async function setup(verdict: () => Promise<unknown>) {
  const db = await getTestDatabase();
  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: "clerk_ada",
      email: "ada@example.com",
      firstName: "",
      lastName: "",
      fullName: "",
    })
    .returning();
  const { providerPackage, generateObject } = fakePackage(verdict);
  const ai = createAiClient({
    db,
    userId: user.id,
    funding: "credits",
    providerPackage,
  });
  return { db, ai, generateObject, user };
}

describe("topic gate", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("gives an off-topic message the fixed reply without calling the main model", async () => {
    const { ai } = await setup(async () => ({ on_topic: false }));
    const answer = vi.fn(async () => "main model answer");

    const reply = await replyToChatMessage({
      ai,
      context: "career_interview",
      message: "Write me a poem about pizza",
      answer,
    });

    expect(reply).toEqual({ kind: "off_topic" });
    expect(answer).not.toHaveBeenCalled();
  });

  it("lets an on-topic message through to the main model", async () => {
    const { ai } = await setup(async () => ({ on_topic: true }));

    const reply = await replyToChatMessage({
      ai,
      context: "career_interview",
      message: "At Acme I led the move to Kubernetes",
      answer: async () => "Tell me more about the team",
    });

    expect(reply).toEqual({
      kind: "answer",
      text: "Tell me more about the team",
    });
  });

  it("fails closed when the classifier errors", async () => {
    const { ai } = await setup(async () => {
      throw new Error("overloaded");
    });
    const answer = vi.fn(async () => "main model answer");

    const reply = await replyToChatMessage({
      ai,
      context: "opening",
      message: "Is this opening a good fit?",
      answer,
    });

    expect(reply).toEqual({ kind: "off_topic" });
    expect(answer).not.toHaveBeenCalled();
  });

  it("fails closed when the classifier's answer doesn't parse", async () => {
    const { ai } = await setup(async () => null);

    const reply = await replyToChatMessage({
      ai,
      context: "document",
      message: "Make the summary shorter",
      answer: async () => "ok",
    });

    expect(reply).toEqual({ kind: "off_topic" });
  });

  it("classifies with the cheap role and records the call's token usage", async () => {
    const { db, ai, generateObject, user } = await setup(async () => ({
      on_topic: true,
    }));

    await replyToChatMessage({
      ai,
      context: "career_interview",
      message: "hello",
      answer: async () => "hi",
    });

    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ role: "classification" })
    );
    const rows = await db.select().from(aiUsageTable);
    expect(rows).toEqual([
      expect.objectContaining({
        userId: user.id,
        purpose: "topic_gate",
        funding: "credits",
        role: "classification",
        model: "claude-haiku-5-5",
        inputTokens: 120,
        outputTokens: 8,
      }),
    ]);
  });
});
