import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadSensitiveFilter } from "@repo/api/domains/evidence/sensitive/load-sensitive-filter";
import type { DbClient } from "@repo/api/tools/db-client";

import { createAiClient } from "./ai-client";
import { resolveAiFunding } from "./ai-funding";

/**
 * What a task needs to call a model for a user: their cipher, and an AI
 * client on their funding that records usage against the task and applies
 * their sensitivity choices to every system prompt.
 */
export async function createTaskAi(input: {
  db: DbClient;
  userId: string;
  taskId: string;
}) {
  const cipher = await getUserCipher(input.db, input.userId);
  const profile = await new CareerRepository(input.db).findProfileByUserId(
    input.userId
  );
  const sensitiveFilter = profile
    ? await loadSensitiveFilter({ db: input.db, cipher, profileId: profile.id })
    : undefined;
  const { funding, providerPackage } = resolveAiFunding();

  return {
    cipher,
    profileId: profile?.id,
    ai: createAiClient({
      db: input.db,
      userId: input.userId,
      taskId: input.taskId,
      funding,
      providerPackage,
      sensitiveFilter,
    }),
  };
}
