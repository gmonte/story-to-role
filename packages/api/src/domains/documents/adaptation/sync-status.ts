import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";

import type { DocumentsRepository } from "../documents-repository";
import type { OutputLanguage } from "../schemas/document";
import { decryptResume } from "../snapshot-content";
import { areLinked, syncBases } from "./sync-link";
import { syncChanges } from "./three-way-merge";

type Version = NonNullable<
  Awaited<ReturnType<DocumentsRepository["findVersion"]>>
>;

type Outdated = {
  versionId: string;
  language: OutputLanguage;
  changes: number;
  baseMissing: boolean;
};

/**
 * Outdated markers (resume spec, "Language sync"): for each pair of linked
 * versions, the line changes each side has not received from the other.
 * Nothing changes on its own.
 */
export async function outdatedVersions(
  repository: DocumentsRepository,
  cipher: UserCipher,
  versions: Version[]
) {
  const outdated = new Map<string, Outdated[]>(
    versions.map((version) => [version.id, []])
  );
  const behind = async (target: Version, from: Version) => {
    const bases = await syncBases(repository, target, from);
    const source = await repository.latestSnapshot(from.id);
    const current = await repository.latestSnapshot(target.id);
    if (!bases || !source || !current) return;
    const changes =
      bases.base && bases.targetBase
        ? syncChanges({
            base: decryptResume(cipher, bases.base),
            source: decryptResume(cipher, source),
            targetBase: decryptResume(cipher, bases.targetBase),
            target: decryptResume(cipher, current),
          }).length
        : null;
    if (changes === null || changes > 0) {
      outdated.get(target.id)!.push({
        versionId: from.id,
        language: from.language,
        changes: changes ?? 0,
        baseMissing: changes === null,
      });
    }
  };
  for (const [index, version] of versions.entries()) {
    for (const other of versions.slice(index + 1)) {
      if (!areLinked(version, other)) continue;
      await behind(version, other);
      await behind(other, version);
    }
  }
  return outdated;
}
