import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";

import { CareerEventsRepository } from "./career-events-repository";
import { careerEventKinds, type CareerEventKind } from "./schemas/career";

// Every change gets a word from the chat (a burst of them, one): the user
// sees it follow along. A kind could stay context only for its next turn.
const reactiveKinds: ReadonlySet<CareerEventKind> = new Set(careerEventKinds);

/**
 * Records what the user just did to their career outside the chat, in the
 * same transaction as the change. `summary` is one plain English sentence
 * for the chat's prompt ("approved 5 facts for Staff Engineer at Acme").
 */
export async function recordCareerEvent(
  tx: DbClient,
  input: {
    userId: string;
    profileId: string;
    kind: CareerEventKind;
    summary: string;
  }
) {
  const cipher = await getUserCipher(tx, input.userId);
  await new CareerEventsRepository(tx).insert({
    profileId: input.profileId,
    kind: input.kind,
    encryptedSummary: cipher.encrypt(input.summary),
    reactive: reactiveKinds.has(input.kind),
  });
}
