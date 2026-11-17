import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";
import type { Embedder } from "@repo/api/tools/embeddings/embedder";

import { ProfileRepository } from "./profile-repository";

/**
 * The vectors of a published version's passages (ADR 0004), computed with
 * the local model; passages that already have one are skipped, so a retry
 * finishes the rest.
 */
export async function embedProfileVersion(input: {
  db: DbClient;
  cipher: UserCipher;
  embedder: Embedder;
  profileVersionId: string;
}) {
  const repository = new ProfileRepository(input.db);
  const passages = await repository.passagesWithoutVectors(
    input.profileVersionId
  );
  if (!passages.length) return;
  const vectors = await input.embedder.embed(
    passages.map((passage) => input.cipher.decrypt(passage.encryptedText)),
    "passage"
  );
  for (const [index, passage] of passages.entries()) {
    await repository.setPassageVector(passage.id, vectors[index]);
  }
}
