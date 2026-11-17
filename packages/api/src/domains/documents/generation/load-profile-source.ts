import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadPublishedProfile } from "@repo/api/domains/profile/load-published-profile";
import type { DbClient } from "@repo/api/tools/db-client";

import { type ProfileSource, readProfileSource } from "./profile-source";

/**
 * A published version of the user's profile as generation reads it: the
 * one published now, or the one a document froze. Null until the user
 * publishes a profile.
 */
export async function loadProfileSource(input: {
  db: DbClient;
  cipher: UserCipher;
  // The user's career profile, whose id positions derive theirs from.
  profileId: string;
  profileVersionId?: string | null;
}): Promise<ProfileSource | null> {
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
  return published
    ? readProfileSource({
        careerProfileId: input.profileId,
        profile: published,
      })
    : null;
}
