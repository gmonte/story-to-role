import { randomBytes } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { parseMasterKeys } from "@repo/api/tools/crypto/envelope";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { userDataKeysTable } from "./db/encryption-tables";
import { getUserCipher } from "./user-cipher";

const masterKeys = parseMasterKeys(`v1:${randomBytes(32).toString("base64")}`);

async function createUser(email: string) {
  const db = await getTestDatabase();
  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `clerk_${email}`,
      email,
      firstName: "Ada",
      lastName: "Lovelace",
      fullName: "Ada Lovelace",
    })
    .returning();
  return user;
}

describe("user cipher", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("stores content the database can't read and the service can", async () => {
    const db = await getTestDatabase();
    const user = await createUser("ada@example.com");
    // A scratch table standing in for any column of career content.
    await db.execute(
      sql`CREATE TABLE IF NOT EXISTS scratch_quotes (user_id uuid, quote text)`
    );

    const cipher = await getUserCipher(db, user.id, masterKeys);
    await db.execute(
      sql`INSERT INTO scratch_quotes VALUES (${user.id}, ${cipher.encrypt("I cut cloud costs by 40% at Acme")})`
    );

    const { rows } = await db.execute<{ quote: string }>(
      sql`SELECT quote FROM scratch_quotes WHERE user_id = ${user.id}`
    );
    expect(rows[0].quote).not.toContain("Acme");

    const later = await getUserCipher(db, user.id, masterKeys);
    expect(later.decrypt(rows[0].quote)).toBe(
      "I cut cloud costs by 40% at Acme"
    );
  });

  it("creates one data key per user, wrapped, on first use", async () => {
    const db = await getTestDatabase();
    const user = await createUser("ada@example.com");

    await Promise.all([
      getUserCipher(db, user.id, masterKeys),
      getUserCipher(db, user.id, masterKeys),
    ]);

    const keys = await db
      .select()
      .from(userDataKeysTable)
      .where(eq(userDataKeysTable.userId, user.id));
    expect(keys).toHaveLength(1);
    expect(keys[0].masterKeyVersion).toBe(1);
  });

  it("can't read another user's content", async () => {
    const db = await getTestDatabase();
    const ada = await createUser("ada@example.com");
    const grace = await createUser("grace@example.com");

    const ciphertext = (await getUserCipher(db, ada.id, masterKeys)).encrypt(
      "x"
    );
    const graceCipher = await getUserCipher(db, grace.id, masterKeys);

    expect(() => graceCipher.decrypt(ciphertext)).toThrow();
  });
});
