import type { AiFunding } from "@repo/api/domains/ai/ai-funding";
import { AiKeysRepository } from "@repo/api/domains/ai/ai-keys-repository";
import type { DbClient } from "@repo/api/tools/db-client";

import { ensureMonthlyCredits, spendableTotal } from "./credit-ledger";
import { currentPlan } from "./credit-plan";
import type { CreditScope } from "./schemas/credits";

/**
 * Who pays for a task (billing spec, "Funding order"), decided when it
 * starts:
 *
 * - Free to the user (no cap): the user's key on the own-key or courtesy
 *   plan, otherwise StoryToRole pays, taking no credit.
 * - Free and the credit subscription: credits; they never use a key.
 * - Courtesy plan: the user's key first, then courtesy credits.
 * - Own-key subscription: credits carried over from the credit
 *   subscription it replaced first, then the user's key.
 *
 * Stored credits come last on a paid plan and only once the user
 * confirmed "Finish with credits"; a key that ran out never switches to
 * them by itself.
 */
export async function decideFunding(
  tx: DbClient,
  input: {
    userId: string;
    cap: number;
    scope: CreditScope;
    now: Date;
    // Credits the action may not touch (the credit reserve).
    keep?: number;
  }
): Promise<AiFunding> {
  const plan = await currentPlan(tx, input.userId, input.now);
  const key = await new AiKeysRepository(tx).findByUserId(input.userId);
  const usableKey =
    key?.status === "active" &&
    (plan.kind === "own_key" || plan.kind === "courtesy");
  // Free to the user (StoryToRole's cost): their own key when they use one.
  if (input.cap <= 0) return usableKey ? "key" : "credits";
  if (plan.kind === "free" || plan.kind === "subscription") return "credits";
  if (plan.kind === "courtesy") return usableKey ? "key" : "credits";
  await ensureMonthlyCredits(tx, input.userId, input.now);
  const planCredits = await spendableTotal(
    tx,
    input.userId,
    input.scope,
    input.now,
    false
  );
  return planCredits - (input.keep ?? 0) < input.cap && usableKey
    ? "key"
    : "credits";
}
