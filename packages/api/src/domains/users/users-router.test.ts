import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";
import { createCallerFactory } from "@repo/api/tools/trpc";

import { usersRouter } from "./users-router";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@repo/api/tools/db", async () => ({
  db: await getTestDatabase(),
}));

function callerFor(clerkUserId: string) {
  // Message ids come from the formatjs babel plugin, which tests don't run.
  const t = {
    formatMessage: ({ defaultMessage }: { defaultMessage: string }) =>
      defaultMessage,
  };
  return createCallerFactory(usersRouter)({
    session: { userId: clerkUserId },
    t,
    headers: new Headers(),
  } as never);
}

beforeEach(clearTestDatabase);
afterAll(closeTestDatabase);

describe("users.accountReady", () => {
  it("is false until the Clerk webhook creates the local user", async () => {
    await expect(
      callerFor("clerk_ada@example.com").accountReady({})
    ).resolves.toEqual({ ready: false });
  });

  it("is true once the local user exists", async () => {
    await createTestUser("ada@example.com");

    await expect(
      callerFor("clerk_ada@example.com").accountReady({})
    ).resolves.toEqual({ ready: true });
  });
});
