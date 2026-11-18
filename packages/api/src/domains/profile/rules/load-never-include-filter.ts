import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadPublishedProfile } from "@repo/api/domains/profile/load-published-profile";
import type { DbClient } from "@repo/api/tools/db-client";

import {
  neverIncludeCategories,
  neverIncludeTerms,
} from "./never-include-terms";
import type { PublicName } from "./public-names";
import { createNeverIncludeFilter } from "./never-include-filter";

/** The filter of a profile's communication rules: what must never appear. */
export function communicationRulesFilter(rules: {
  neverInclude: string[];
  publicNames?: PublicName[];
}) {
  return createNeverIncludeFilter(
    neverIncludeTerms(rules.neverInclude).map((original) => ({
      original,
      choice: "exclude" as const,
    })),
    {
      categories: neverIncludeCategories(rules.neverInclude),
      publicNames: rules.publicNames,
    }
  );
}

/**
 * What the user's published profile says must never appear in what is
 * generated (its communication rules' "never include" list), as a filter
 * applied by code: taken out of what enters a prompt, and an output still
 * carrying one of those terms is rejected. A given version's rules for a
 * document that froze it; nothing to filter until a profile is published.
 */
export async function loadNeverIncludeFilter(input: {
  db: DbClient;
  cipher: UserCipher;
  profileId: string;
  profileVersionId?: string | null;
}) {
  const career = await new CareerRepository(input.db).findProfileById(
    input.profileId
  );
  const published = career
    ? await loadPublishedProfile({
        db: input.db,
        cipher: input.cipher,
        userId: career.userId,
        profileVersionId: input.profileVersionId ?? undefined,
      })
    : null;
  return communicationRulesFilter(
    published?.extract.rules ?? { neverInclude: [] }
  );
}
