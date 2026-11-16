import { eq } from "drizzle-orm";

import { applicationOverridesTable } from "@repo/api/domains/applications/db/instructions-tables";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";

import { EvidenceRepository } from "../evidence-repository";
import { createSensitiveFilter } from "./sensitive-filter";

/**
 * The user's sensitivity choices as a filter, decrypted in memory. For an
 * opening's application, its overrides replace the general choice of the
 * items they name (guided interview spec, "Per-application overrides").
 */
export async function loadSensitiveFilter(input: {
  db: DbClient;
  cipher: UserCipher;
  profileId: string;
  openingId?: string | null;
}) {
  const items = await new EvidenceRepository(input.db).listSensitiveItems(
    input.profileId
  );
  const overrides = input.openingId
    ? await input.db
        .select()
        .from(applicationOverridesTable)
        .where(eq(applicationOverridesTable.openingId, input.openingId))
    : [];
  const open = (value: string | null) =>
    value ? input.cipher.decrypt(value) : null;
  return createSensitiveFilter(
    items.map((item) => {
      const override = overrides.find((row) => row.sensitiveItemId === item.id);
      return {
        original: input.cipher.decrypt(item.encryptedOriginal),
        choice: override?.choice ?? item.choice,
        generalized:
          open(override?.encryptedGeneralized ?? null) ??
          open(item.encryptedGeneralized),
      };
    })
  );
}
