import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { decideFunding } from "@repo/api/domains/credits/credit-funding";
import type { DbClient } from "@repo/api/tools/db-client";

import { createAiClient } from "./ai-client";
import { resolveAiFunding } from "./ai-funding";

/**
 * An AI client for a small call made outside a task, with no credit spent
 * (the cap is zero: the user's own key on a paid plan, else StoryToRole
 * pays); its usage is recorded against the user with no task.
 */
export async function smallCallAi(
  db: DbClient,
  userId: string,
  cipher: UserCipher
) {
  const funding = await decideFunding(db, {
    userId,
    cap: 0,
    scope: "any",
    now: new Date(),
  });
  const { providerPackage } = await resolveAiFunding({
    db,
    userId,
    cipher,
    funding,
  });
  return createAiClient({ db, userId, funding, providerPackage });
}
