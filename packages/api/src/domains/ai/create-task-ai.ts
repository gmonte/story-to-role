import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadSensitiveFilter } from "@repo/api/domains/evidence/sensitive/load-sensitive-filter";
import type { DbClient } from "@repo/api/tools/db-client";

import { createAiClient } from "./ai-client";
import { resolveAiFunding } from "./ai-funding";

/**
 * What a task needs to call a model for a user: their cipher, and an AI
 * client on their funding that records usage against the task and takes
 * what their profile's communication rules forbid out of every system
 * prompt.
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
    ? await loadSensitiveFilter({
        db: input.db,
        cipher,
        profileId: profile.id,
      })
    : undefined;
  const task = await new TasksRepository(input.db).findOwner(input.taskId);
  const { funding, providerPackage, languageModel } = await resolveAiFunding({
    db: input.db,
    userId: input.userId,
    cipher,
    funding: task?.funding ?? "credits",
  });

  return {
    cipher,
    profileId: profile?.id,
    sensitiveFilter,
    funding,
    languageModel,
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
