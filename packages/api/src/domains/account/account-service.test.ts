import { randomBytes } from "node:crypto";

import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TrackerService } from "@repo/api/domains/applications/tracker/tracker-service";
import { AiKeysRepository } from "@repo/api/domains/ai/ai-keys-repository";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { AgentChatRepository } from "@repo/api/domains/agents/agent-chat-repository";
import { DocumentsRepository } from "@repo/api/domains/documents/documents-repository";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";
import type { Storage } from "@repo/api/tools/storage/storage";
import * as tables from "@repo/api/db";

import { exportPaths } from "./account-export";
import { notExported } from "./account-repository";
import { AccountService } from "./account-service";

vi.mock("@repo/common/env/web.env", () => ({
  env: {
    ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}`,
  },
}));
vi.mock("@repo/api/tools/trigger/trigger-client", () => ({
  triggerClient: { trigger: vi.fn() },
}));

function memoryStorage(): Storage & { keys: () => string[] } {
  const files = new Map<string, Buffer>();
  return {
    put: async (key, body) => {
      files.set(key, body);
    },
    get: async (key) => files.get(key) ?? null,
    delete: async (key) => {
      files.delete(key);
    },
    keys: () => [...files.keys()],
  };
}

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
  const storage = memoryStorage();
  const billing = { removeForDeletion: vi.fn(() => Promise.resolve()) };
  const deleteClerkUser = vi.fn((_clerkUserId: string) => Promise.resolve());
  const cancelRun = vi.fn((_runId: string) => Promise.resolve());
  const closeChatSession = vi.fn((_chatId: string) => Promise.resolve());
  const account = new AccountService(db, {
    storage,
    billing,
    deleteClerkUser,
    cancelRun,
    closeChatSession,
  });
  // A conversation with the profile agent and one with a document's
  // agent, whose sessions live on Trigger.dev.
  const chat = await new AgentChatRepository(db).insertChat({
    userId: user.id,
    subject: "profile",
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  const libraryDocument = await new DocumentsRepository(db).insertDocument({
    profileId: profile.id,
    kind: "resume",
    encryptedFocus: cipher.encrypt("Platform roles"),
  });
  const documentChat = await new AgentChatRepository(db).insertChat({
    userId: user.id,
    subject: "document",
    documentId: libraryDocument.id,
    expiresAt: new Date(Date.now() + 86_400_000),
  });

  // Some of everything: an imported file, an application with an event, an
  // own key.
  const storageKey = `users/${user.id}/documents/1`;
  await storage.put(
    storageKey,
    Buffer.from(cipher.encrypt(Buffer.from("%PDF-resume").toString("base64"))),
    { contentType: "application/octet-stream" }
  );
  await career.insertDocument({
    profileId: profile.id,
    kind: "resume",
    encryptedFileName: cipher.encrypt("my resume.pdf"),
    mimeType: "application/pdf",
    storageKey,
  });
  const tracker = new TrackerService(db);
  const { applicationId } = await tracker.createExternal({
    userId: user.id,
    company: "Globex",
    title: "SRE",
    link: "https://example.com/jobs/1",
    status: "applied",
  });
  await tracker.addEvent({
    userId: user.id,
    applicationId,
    occurredAt: new Date(),
    text: "HR interview went well",
  });
  await new AiKeysRepository(db).upsert({
    userId: user.id,
    encryptedKey: cipher.encrypt("sk-ant-secret-key-0000000000WXYZ"),
    lastCharacters: "WXYZ",
    status: "active",
    now: new Date(),
  });
  return {
    db,
    user,
    storage,
    billing,
    deleteClerkUser,
    closeChatSession,
    chat,
    documentChat,
    account,
  };
}

describe("account", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("exports everything decrypted, with the files, but no secrets", async () => {
    const ctx = await setup();
    const { stream } = await ctx.account.export(ctx.user.id);
    const zip = unzipSync(
      new Uint8Array(await new Response(stream).arrayBuffer())
    );
    const read = (name: string) => JSON.parse(strFromU8(zip[name])) as unknown;

    expect(read("career/profile.json")).toEqual([
      expect.objectContaining({ interviewLanguage: "en-US" }),
    ]);
    expect(read("applications/events.json")).toContainEqual(
      expect.objectContaining({ text: "HR interview went well" })
    );
    expect(read("openings/openings.json")).toEqual([
      expect.objectContaining({ company: "Globex", status: "external" }),
    ]);
    const imported = Object.keys(zip).find((name) =>
      name.startsWith("imported-files/")
    )!;
    expect(strFromU8(zip[imported])).toBe("%PDF-resume");
    // No ciphertext, no keys.
    const everything = Object.entries(zip)
      .filter(([name]) => name.endsWith(".json"))
      .map(([, data]) => strFromU8(data))
      .join("\n");
    expect(everything).not.toContain("sk-ant-secret");
    expect(everything).not.toMatch(/"encrypted\w+"/);
    expect(read("billing/own-api-key.json")).toEqual([
      expect.objectContaining({ lastCharacters: "WXYZ" }),
    ]);
    expect(imported).toMatch(/_my resume\.pdf$/);
  });

  it("deletes the account and everything in it at once", async () => {
    const ctx = await setup();

    await ctx.account.deleteAccount({
      userId: ctx.user.id,
      clerkUserId: ctx.user.clerkUserId,
      email: ctx.user.email,
      confirmEmail: ` ${ctx.user.email.toUpperCase()} `,
    });

    expect(ctx.billing.removeForDeletion).toHaveBeenCalledWith(ctx.user.id);
    expect(ctx.deleteClerkUser).toHaveBeenCalledWith(ctx.user.clerkUserId);
    expect(ctx.closeChatSession).toHaveBeenCalledWith(ctx.chat.id);
    expect(ctx.closeChatSession).toHaveBeenCalledWith(ctx.documentChat.id);
    expect(ctx.storage.keys()).toEqual([]);
    for (const table of [
      "users",
      "user_data_keys",
      "career_profiles",
      "openings",
      "applications",
      "application_events",
      "ai_keys",
      "credit_lots",
      "source_documents",
      "agent_chats",
    ]) {
      const result = await ctx.db.execute<{ count: number }>(
        sql.raw(`select count(*)::int as count from ${table}`)
      );
      expect([table, result.rows[0].count]).toEqual([table, 0]);
    }
  });

  it("deletes nothing when Clerk can't delete the user, or the email differs", async () => {
    const ctx = await setup();
    await expect(
      ctx.account.deleteAccount({
        userId: ctx.user.id,
        clerkUserId: ctx.user.clerkUserId,
        email: ctx.user.email,
        confirmEmail: "someone@else.com",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    ctx.deleteClerkUser.mockRejectedValueOnce(new Error("Clerk is down"));
    await expect(
      ctx.account.deleteAccount({
        userId: ctx.user.id,
        clerkUserId: ctx.user.clerkUserId,
        email: ctx.user.email,
        confirmEmail: ctx.user.email,
      })
    ).rejects.toThrow("Clerk is down");

    const result = await ctx.db.execute<{ count: number }>(
      sql`select count(*)::int as count from users`
    );
    expect(result.rows[0].count).toBe(1);
  });

  it("leaves no table out of the export by accident", () => {
    const names = Object.values(tables)
      .filter((value) => is(value, PgTable))
      .map((table) => getTableName(table as PgTable));
    const covered = new Set([...Object.keys(exportPaths), ...notExported]);
    expect(names.filter((name) => !covered.has(name))).toEqual([]);
  });

  it("deletes the data when Clerk deletes the user", async () => {
    const ctx = await setup();
    await ctx.account.deleteByClerkUser(ctx.user.clerkUserId);

    expect(ctx.deleteClerkUser).not.toHaveBeenCalled();
    const result = await ctx.db.execute<{ count: number }>(
      sql`select count(*)::int as count from users`
    );
    expect(result.rows[0].count).toBe(0);
  });
});
