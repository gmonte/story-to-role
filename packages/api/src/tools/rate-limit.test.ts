import { describe, expect, it, vi } from "vitest";

import type { RateLimiter } from "./rate-limit";
import {
  createCallerFactory,
  createTRPCRouter,
  publicProcedure,
  rateLimited,
} from "./trpc";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));

/** Allows `limit` calls per identifier, like a window that never slides. */
function countingLimiter(limit: number): RateLimiter {
  const counts = new Map<string, number>();
  return {
    async allow(_name, identifier) {
      const count = (counts.get(identifier) ?? 0) + 1;
      counts.set(identifier, count);
      return count <= limit;
    },
  };
}

async function callerFor(userId: string, limiter: RateLimiter) {
  const router = createTRPCRouter({
    start: publicProcedure
      .use(rateLimited("taskStart", limiter))
      .mutation(() => "started"),
  });
  // Message ids come from the formatjs babel plugin, which tests don't run.
  const t = {
    formatMessage: ({ defaultMessage }: { defaultMessage: string }) =>
      defaultMessage,
  };
  return createCallerFactory(router)({
    session: null,
    t,
    headers: new Headers(),
    userId,
  } as never);
}

describe("rate limits", () => {
  it("blocks a burst past the limit with TOO_MANY_REQUESTS", async () => {
    const caller = await callerFor("user-1", countingLimiter(2));

    await expect(caller.start()).resolves.toBe("started");
    await expect(caller.start()).resolves.toBe("started");
    await expect(caller.start()).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("counts each user separately", async () => {
    const limiter = countingLimiter(1);
    const ada = await callerFor("ada", limiter);
    const grace = await callerFor("grace", limiter);

    await ada.start();
    await expect(grace.start()).resolves.toBe("started");
    await expect(ada.start()).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });
});
