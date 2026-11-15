import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { DbClient } from "@repo/api/tools/db-client";

import { InstructionsRepository } from "./instructions-repository";

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
  return (await openings.listFitCheckItems(fitCheck.id))
    .filter(
      (item) =>
        item.encryptedGapQuestion &&
        item.encryptedGapAnswer &&
        !split.has(item.id)
    )
    .map((item) => ({
      fitCheckItemId: item.id,
      question: input.cipher.decrypt(item.encryptedGapQuestion!),
      answer: input.cipher.decrypt(item.encryptedGapAnswer!),
    }));
}
