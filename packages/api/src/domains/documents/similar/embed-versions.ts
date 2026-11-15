import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { logger } from "@repo/common/tools/logger";
import type { DbClient } from "@repo/api/tools/db-client";
import type { Embedder } from "@repo/api/tools/embeddings/embedder";

import { DocumentsRepository } from "../documents-repository";
import { documentText } from "../document-text";
import { decryptDocument } from "../snapshot-content";

/**
 * Vectors of the user's document versions, for suggesting similar ones to
 * an opening (resume spec, "Flow"): every version whose latest snapshot
 * has no vector yet gets one, from its plain text, with the local model.
 */
export async function embedStaleVersions(input: {
  db: DbClient;
  cipher: UserCipher;
  embedder: Embedder;
  userId: string;
}) {
  const profile = await new CareerRepository(input.db).findProfileByUserId(
    input.userId
  );
  if (!profile) return;
  const repository = new DocumentsRepository(input.db);
  const stale = await repository.staleVersionVectors(profile.id);
  if (stale.length === 0) return;
  const vectors = await input.embedder.embed(
    stale.map((row) => documentText(decryptDocument(input.cipher, row))),
    "passage"
  );
  for (const [index, row] of stale.entries()) {
    await repository.updateVersion(row.versionId, {
      embedding: vectors[index],
      embeddedSnapshotId: row.snapshotId,
    });
  }
}

/**
 * The same, after a task's own work is done: suggestions are a hint, so a
 * failure here never fails the document that was just produced.
 */
export async function refreshVersionVectors(
  input: Parameters<typeof embedStaleVersions>[0]
) {
  try {
    await embedStaleVersions(input);
  } catch (error) {
    logger.warn(["documents"], "Document vectors not refreshed", { error });
  }
}
