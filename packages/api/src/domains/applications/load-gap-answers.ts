import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { DbClient } from "@repo/api/tools/db-client";

import { InstructionsRepository } from "./instructions-repository";

const conditionWords = {
  meets: "I meet this condition.",
  not_blocker: "I don't meet this condition, but it is not a blocker for me.",
  blocker: "This condition is a blocker for me.",
} as const;

/**
 * Answers to the opening's gap questions not yet turned into instruction
 * points (resume spec, "Flow"): each one becomes a point at the next split.
 */
export async function loadPendingGapAnswers(input: {
  db: DbClient;
  cipher: UserCipher;
  openingId: string;
}) {
  const openings = new OpeningsRepository(input.db);
  const [fitCheck] = await openings.latestFitChecks([input.openingId]);
  if (!fitCheck) return [];
  const split = await new InstructionsRepository(input.db).splitFitCheckItemIds(
    input.openingId
  );
  // Only what the description as it is now asks: an edited one's old
  // requirements, and the answers to them, no longer count.
  const terms = new Map(
    (await openings.listCurrentTerms(input.openingId)).map((term) => [
      term.id,
      input.cipher.decrypt(term.encryptedText),
    ])
  );
  return (await openings.listFitCheckItems(fitCheck.id))
    .filter(
      (item) =>
        terms.has(item.termId) &&
        (item.encryptedGapAnswer !== null || item.conditionStance !== null) &&
        !split.has(item.id)
    )
    .map((item) => ({
      fitCheckItemId: item.id,
      // A declared gap has no question: the requirement stands for it.
      question: item.encryptedGapQuestion
        ? input.cipher.decrypt(item.encryptedGapQuestion)
        : (terms.get(item.termId) ?? ""),
      answer: [
        item.conditionStance ? conditionWords[item.conditionStance] : null,
        item.encryptedGapAnswer
          ? input.cipher.decrypt(item.encryptedGapAnswer)
          : null,
      ]
        .filter(Boolean)
        .join(" "),
    }));
}
