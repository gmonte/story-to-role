import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import {
  fakeProviderPackage,
  fakeUsage,
} from "@repo/api/test/fake-provider-package";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { createAiClient } from "./ai-client";
import { aiUsageTable } from "./db/ai-tables";
import { OutputTruncatedError } from "./providers/provider-package";

const request = {
  purpose: "fit_check_judgment",
  role: "classification" as const,
  maxTokens: 1000,
  schema: z.object({ ok: z.boolean() }),
  system: "Judge.",
  messages: [{ role: "user" as const, content: "Go." }],
};

/** A client whose provider answers each call with the next scripted step. */
async function setup(steps: Array<"cut" | "answer">) {
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
  const { providerPackage, generateObject } = fakeProviderPackage({});
  for (const step of steps) {
    generateObject.mockImplementationOnce(async () => {
      if (step === "cut") throw new OutputTruncatedError(fakeUsage());
      return { object: { ok: true } as never, usage: fakeUsage() };
    });
  }
  const ai = createAiClient({
    db,
    userId: user.id,
    funding: "credits",
    providerPackage,
  });
  return { db, ai, generateObject };
}

describe("AI client", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("asks once more, with twice the room, when an answer is cut at its limit", async () => {
    const { db, ai, generateObject } = await setup(["cut", "answer"]);

    expect((await ai.generateObject(request)).object).toEqual({ ok: true });

    expect(generateObject).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ maxTokens: 1000 })
    );
    expect(generateObject).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ maxTokens: 2000 })
    );
    // The cut answer was paid for too.
    expect(await db.select().from(aiUsageTable)).toHaveLength(2);
  });

  it("gives up when the second answer is cut as well, its usage recorded", async () => {
    const { db, ai, generateObject } = await setup(["cut", "cut"]);

    await expect(ai.generateObject(request)).rejects.toBeInstanceOf(
      OutputTruncatedError
    );

    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(await db.select().from(aiUsageTable)).toHaveLength(2);
  });
});
