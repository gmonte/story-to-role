import type { DbClient } from "@repo/api/tools/db-client";

import { grantCredits } from "./credit-ledger";
import { creditSettings } from "./credit-pricing";

/**
 * The Free plan's welcome credits (billing spec, "Free plan"): granted once
 * per user, from their sign-up, and never expiring. Granting again (the
 * webhook redelivered, a returning user, reconciliation) changes nothing.
 */
export const grantWelcomeCredits = (db: DbClient, userId: string) =>
  grantCredits(db, {
    userId,
    source: "welcome",
    amount: creditSettings.welcomeCredits,
    origin: `welcome:${userId}`,
    expiresAt: null,
  });
