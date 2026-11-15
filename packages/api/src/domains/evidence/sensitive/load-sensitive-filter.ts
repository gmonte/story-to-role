import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";

import { EvidenceRepository } from "../evidence-repository";
import { createSensitiveFilter } from "./sensitive-filter";

/** The user's sensitivity choices as a filter, decrypted in memory. */
export async function loadSensitiveFilter(input: {
  db: DbClient;
  cipher: UserCipher;
  profileId: string;
}) {
  const items = await new EvidenceRepository(input.db).listSensitiveItems(
    input.profileId
  );
  return createSensitiveFilter(
    items.map((item) => ({
      original: input.cipher.decrypt(item.encryptedOriginal),
      choice: item.choice,
      generalized: item.encryptedGeneralized
        ? input.cipher.decrypt(item.encryptedGeneralized)
        : null,
    }))
  );
}
