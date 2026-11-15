import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";
import type { Embedder } from "@repo/api/tools/embeddings/embedder";

import { decryptSnapshot } from "../adaptation/adaptation-service";
import { DocumentsRepository } from "../documents-repository";
import { resumeText } from "../generation/resume-checks";

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
  const stale = [];
  for (const { version } of await repository.listProfileVersions(profile.id)) {
    const latest = await repository.latestSnapshot(version.id);
    if (latest && latest.id !== version.embeddedSnapshotId) {
      stale.push({ version, latest });
    }
  }
  if (stale.length === 0) return;
  const vectors = await input.embedder.embed(
    stale.map(({ latest }) =>
      resumeText(decryptSnapshot(input.cipher, latest))
    ),
    "passage"
  );
  for (const [index, { version, latest }] of stale.entries()) {
    await repository.updateVersion(version.id, {
      embedding: vectors[index],
      embeddedSnapshotId: latest.id,
    });
  }
}
