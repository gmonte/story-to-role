import { TRPCError } from "@trpc/server";

import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadPublishedProfile } from "@repo/api/domains/profile/load-published-profile";
import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "../documents-repository";
import {
  defaultGenerationSettings,
  type GenerationSettings,
  generationSettingsSchema,
} from "../schemas/generation-settings";

/** The user's generation settings: their defaults over the product's. */
export async function loadGenerationSettings(
  db: DbClient,
  profileId: string
): Promise<GenerationSettings> {
  const template = await new DocumentsRepository(db).findTemplate(profileId);
  return generationSettingsSchema
    .catch(defaultGenerationSettings)
    .parse({ ...defaultGenerationSettings, ...template?.generationSettings });
}

/**
 * What a generation from the profile freezes when it is asked for (ADR
 * 0008): the version published now, the only source of the document's
 * facts, and the settings for this document (the user's defaults, with
 * what they changed in the form). Nothing is generated before a profile is
 * published.
 */
export async function freezeGeneration(input: {
  db: DbClient;
  cipher: UserCipher;
  userId: string;
  profileId: string;
  settings?: Partial<GenerationSettings>;
}) {
  const published = await loadPublishedProfile({
    db: input.db,
    cipher: input.cipher,
    userId: input.userId,
  });
  if (!published) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Publish your profile before generating a document.",
    });
  }
  const settings = generationSettingsSchema.safeParse({
    ...(await loadGenerationSettings(input.db, input.profileId)),
    ...input.settings,
  });
  if (!settings.success) throw new TRPCError({ code: "BAD_REQUEST" });
  return {
    profileVersionId: published.versionId,
    // What a resume may cost depends on how long the career is.
    positions: published.extract.experiences.length,
    settings: settings.data,
  };
}
