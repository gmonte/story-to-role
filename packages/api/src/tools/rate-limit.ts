import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { env } from "@repo/common/env/web.env";

/**
 * Burst limits per user, enforced before anything costs money. Staging and
 * PR previews share one Upstash database, so every key carries
 * REDIS_KEY_PREFIX.
 */
export const rateLimits = {
  // Answers in a conversation (the motivation interview) and the tasks they
  // start: a person types, a script bursts.
  chatMessage: Ratelimit.slidingWindow(10, "1 m"),
  // Starting any other task (generations, research, the sample task).
  taskStart: Ratelimit.slidingWindow(5, "1 m"),
  // Source files uploaded (the most a user keeps is 5 at once).
  sourceUpload: Ratelimit.slidingWindow(10, "1 m"),
  // Source preview pages rendered on the server (a 20-page PDF is 20).
  pageRender: Ratelimit.slidingWindow(60, "1 m"),
} as const;

export type RateLimitName = keyof typeof rateLimits;

export type RateLimiter = {
  /** Resolves to false when `identifier` has exceeded the limit. */
  allow(name: RateLimitName, identifier: string): Promise<boolean>;
};

let limiters: Map<RateLimitName, Ratelimit> | undefined;

function getLimiters() {
  if (!limiters) {
    const redis = Redis.fromEnv();
    limiters = new Map(
      Object.entries(rateLimits).map(([name, limiter]) => [
        name as RateLimitName,
        new Ratelimit({
          redis,
          limiter,
          prefix: `${env.REDIS_KEY_PREFIX}ratelimit:${name}`,
        }),
      ])
    );
  }
  return limiters;
}

export const upstashRateLimiter: RateLimiter = {
  async allow(name, identifier) {
    const { success } = await getLimiters().get(name)!.limit(identifier);
    return success;
  },
};
