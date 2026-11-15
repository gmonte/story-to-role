import { Redis } from "@upstash/redis";

import { env } from "@repo/common/env/web.env";

/**
 * Repeated misuse (guided interview spec, guardrail 8): off-topic and
 * override attempts are counted, and after too many in a short window the
 * chat pauses for a cooldown. Thresholds are settings to tune with use.
 */
export const misuseSettings = {
  maxBlockedMessages: 5,
  windowSeconds: 10 * 60,
  cooldownSeconds: 15 * 60,
};

export type MisuseGuard = {
  isCoolingDown(userId: string): Promise<boolean>;
  recordBlocked(userId: string): Promise<void>;
};

let redis: Redis | undefined;

export const redisMisuseGuard: MisuseGuard = {
  async isCoolingDown(userId) {
    redis ??= Redis.fromEnv();
    return (
      (await redis.exists(
        `${env.REDIS_KEY_PREFIX}misuse:cooldown:${userId}`
      )) === 1
    );
  },

  async recordBlocked(userId) {
    redis ??= Redis.fromEnv();
    const countKey = `${env.REDIS_KEY_PREFIX}misuse:count:${userId}`;
    const count = await redis.incr(countKey);
    if (count === 1) await redis.expire(countKey, misuseSettings.windowSeconds);
    if (count >= misuseSettings.maxBlockedMessages) {
      await redis.set(`${env.REDIS_KEY_PREFIX}misuse:cooldown:${userId}`, 1, {
        ex: misuseSettings.cooldownSeconds,
      });
      await redis.del(countKey);
    }
  },
};
