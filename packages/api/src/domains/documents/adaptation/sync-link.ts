import type { DocumentsRepository } from "../documents-repository";

type Version = NonNullable<
  Awaited<ReturnType<DocumentsRepository["findVersion"]>>
>;

/** Adapting links two versions for language sync, in either direction. */
export const areLinked = (a: Version, b: Version) =>
  a.adaptedFromVersionId === b.id || b.adaptedFromVersionId === a.id;

/**
 * The two snapshots a sync compares against, for a target and the version
 * it receives changes from (resume spec, "Language sync"): the source
 * snapshot the target last came from (the base), and the target snapshot
 * that came from it. Both are read from the latest adaptation or accepted
 * sync between the pair, so undoing one moves the base back with it; a
 * deleted base falls back to its nearest remaining ancestor. Null when the
 * versions are not linked; null snapshots when nothing is left to compare.
 */
export async function syncBases(
  repository: DocumentsRepository,
  target: Version,
  from: Version
) {
  if (!areLinked(target, from)) return null;
  const link = await repository.latestLinkSnapshot(target.id, from.id);
  if (!link) return { base: null, targetBase: null };
  const { snapshot, generation } = link;
  const read = (versionId: string) =>
    repository.snapshotOrAncestor({
      versionId,
      snapshotId: generation.sourceSnapshotId,
      sequence: generation.sourceSnapshotSequence,
    });
  return snapshot.versionId === target.id
    ? { base: await read(from.id), targetBase: snapshot }
    : { base: snapshot, targetBase: await read(target.id) };
}
