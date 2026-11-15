import { AiUsageRepository } from "@repo/api/domains/ai/ai-usage-repository";
import type { DbClient } from "@repo/api/tools/db-client";

import { settleCredits } from "./credit-ledger";
import { creditsForUsage } from "./credit-pricing";

/**
 * Settles a task's reservation: to what its calls cost when it succeeded
 * (never above the cap), to nothing when it failed (billing spec).
 */
export async function settleTask(
  db: DbClient,
  input: { userId: string; taskId: string; succeeded: boolean }
) {
  const actual = input.succeeded
    ? creditsForUsage(
        await new AiUsageRepository(db).creditFundedUsage(input.taskId)
      )
    : 0;
  await db.transaction((tx) =>
    settleCredits(tx, { userId: input.userId, taskId: input.taskId, actual })
  );
}
