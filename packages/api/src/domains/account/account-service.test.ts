import { randomBytes } from "node:crypto";

import { sql } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TrackerService } from "@repo/api/domains/applications/tracker/tracker-service";
import { AiKeysRepository } from "@repo/api/domains/ai/ai-keys-repository";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";
import type { Storage } from "@repo/api/tools/storage/storage";

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
  const billing = { cancelForDeletion: vi.fn(() => Promise.resolve()) };
  const deleteClerkUser = vi.fn((_clerkUserId: string) => Promise.resolve());
  const account = new AccountService(db, { storage, billing, deleteClerkUser });

  // Some of everything: a position, an imported file, an application with
  // an event, an own key.
  await career.insertPosition({
    profileId: profile.id,
    encryptedEmployer: cipher.encrypt("Initech"),
    encryptedTitle: cipher.encrypt("Platform Engineer"),
    status: "approved",
    origin: "manual",
  });
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
  return { db, user, storage, billing, deleteClerkUser, account };
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
    const { bytes } = await ctx.account.export(ctx.user.id);
    const zip = unzipSync(new Uint8Array(bytes));
    const read = (name: string) => JSON.parse(strFromU8(zip[name])) as unknown;

    expect(read("career/positions.json")).toEqual([
      expect.objectContaining({
        employer: "Initech",
        title: "Platform Engineer",
      }),
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
  });

  it("deletes the account and everything in it at once", async () => {
    const ctx = await setup();

    await ctx.account.deleteAccount({
      userId: ctx.user.id,
      clerkUserId: ctx.user.clerkUserId,
    });

    expect(ctx.billing.cancelForDeletion).toHaveBeenCalledWith(ctx.user.id);
    expect(ctx.deleteClerkUser).toHaveBeenCalledWith(ctx.user.clerkUserId);
    expect(ctx.storage.keys()).toEqual([]);
    for (const table of [
      "users",
      "user_data_keys",
      "career_profiles",
      "positions",
      "openings",
      "applications",
      "application_events",
      "ai_keys",
      "credit_lots",
      "source_documents",
    ]) {
      const result = await ctx.db.execute<{ count: number }>(
        sql.raw(`select count(*)::int as count from ${table}`)
      );
      expect([table, result.rows[0].count]).toEqual([table, 0]);
    }
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
