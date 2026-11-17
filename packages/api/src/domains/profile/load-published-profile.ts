import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";

import { extractPreferences, preferenceRules } from "./preferences/preferences";
import { ProfileRepository } from "./profile-repository";
import { parseBlocks } from "./truth/blocks";
import type { ProfileExtract, ProfilePassage } from "./truth/extract";

export type PublishedProfile = {
  versionId: string;
  number: number;
  markdown: string;
  extract: ProfileExtract;
  passages: Array<Omit<ProfilePassage, "lines"> & { id: string }>;
};

/**
 * What screening and generation read (ADR 0008): the user's published
 * version (or a given one, frozen in a document), its extract and its
 * passages. Null when nothing is published yet.
 */
export async function loadPublishedProfile(input: {
  db: DbClient;
  cipher: UserCipher;
  userId: string;
  profileVersionId?: string;
}): Promise<PublishedProfile | null> {
  const repository = new ProfileRepository(input.db);
  const document = await repository.findDocument(input.userId, "profile");
  const versionId = input.profileVersionId ?? document?.publishedVersionId;
  if (!document || !versionId) return null;
  const version = await repository.findVersion(document.id, versionId);
  const extract = version
    ? await repository.findExtract(version.id)
    : undefined;
  if (!version || !extract) return null;
  const passages = await repository.listPassages(version.id);
  return {
    versionId: version.id,
    number: version.number,
    markdown: input.cipher.decrypt(version.encryptedMarkdown),
    extract: JSON.parse(
      input.cipher.decrypt(extract.encryptedContent)
    ) as ProfileExtract,
    passages: passages.map((passage) => ({
      id: passage.id,
      kind: passage.kind,
      section: passage.section as ProfilePassage["section"],
      experience: passage.experience,
      text: input.cipher.decrypt(passage.encryptedText),
    })),
  };
}

/**
 * The user's published job preferences, as screening reads them (profile
 * spec, "Job preferences"): their structure and their text, to quote a rule
 * from. Null when none was published; generation never calls this.
 */
export async function loadPublishedPreferences(input: {
  db: DbClient;
  cipher: UserCipher;
  userId: string;
}) {
  const repository = new ProfileRepository(input.db);
  const document = await repository.findDocument(input.userId, "preferences");
  const version = document?.publishedVersionId
    ? await repository.findVersion(document.id, document.publishedVersionId)
    : undefined;
  if (!version) return null;
  const markdown = input.cipher.decrypt(version.encryptedMarkdown);
  const blocks = parseBlocks(markdown);
  return {
    versionId: version.id,
    markdown,
    extract: extractPreferences(blocks),
    rules: preferenceRules(blocks),
  };
}
