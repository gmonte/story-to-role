import type { DocumentsRepository } from "../documents-repository";
import type { OutputLanguage } from "../schemas/document";
import { syncBases } from "./adaptation-service";

type Outdated = {
  versionId: string;
  language: OutputLanguage;
  changes: number;
  baseMissing: boolean;
};

/**
 * Outdated markers (resume spec, "Language sync"): for each pair of linked
 * versions, the changes each side has not received from the other, counted
 * as snapshots after the last one carried across. Nothing changes on its own.
 */
export async function outdatedVersions(
  repository: DocumentsRepository,
  versions: Array<
    NonNullable<Awaited<ReturnType<DocumentsRepository["findVersion"]>>>
  >
) {
  const outdated = new Map<string, Outdated[]>(
    versions.map((version) => [version.id, []])
  );
  const behind = async (
    target: (typeof versions)[number],
    from: (typeof versions)[number]
  ) => {
    const bases = await syncBases(repository, target, from);
    if (!bases) return;
    const changes = bases.base
      ? await repository.countSnapshotsAfter(from.id, bases.base.sequence)
      : await repository.countSnapshots(from.id);
    if (changes > 0 || !bases.base) {
      outdated.get(target.id)!.push({
        versionId: from.id,
        language: from.language,
        changes,
        baseMissing: !bases.base || !bases.targetBase,
      });
    }
  };
  for (const version of versions) {
    const from = versions.find(
      (row) => row.id === version.adaptedFromVersionId
    );
    if (!from) continue;
    await behind(version, from);
    await behind(from, version);
  }
  return outdated;
}
