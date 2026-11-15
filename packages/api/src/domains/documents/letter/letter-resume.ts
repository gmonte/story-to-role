import type { DocumentsRepository } from "../documents-repository";

/** A letter snapshot's link to its resume (columns of document_snapshots). */
export type ResumeLink = {
  resumeVersionId: string | null;
  resumeSnapshotId: string | null;
  motivationSkipped: boolean | null;
};

/** What a new snapshot of a letter carries over from the one it comes from. */
export const resumeLinkOf = (snapshot: ResumeLink): ResumeLink => ({
  resumeVersionId: snapshot.resumeVersionId,
  resumeSnapshotId: snapshot.resumeSnapshotId,
  motivationSkipped: snapshot.motivationSkipped,
});

/**
 * A cover letter and its resume (resume spec, "Cover letter and its
 * resume"): outdated once the resume version it was written from has a
 * newer snapshot, unless the user dismissed the notice for that one. When
 * the snapshot it used is gone (undone, or its version deleted), the letter
 * counts as written without a resume.
 */
export async function letterResumeState(
  repository: DocumentsRepository,
  latest: ResumeLink,
  version: { dismissedResumeSnapshotId: string | null }
) {
  const used =
    latest.resumeSnapshotId &&
    (await repository.findSnapshot(latest.resumeSnapshotId));
  const resumeLatest =
    used && latest.resumeVersionId
      ? await repository.latestSnapshot(latest.resumeVersionId)
      : null;
  return {
    resumeVersionId: used ? latest.resumeVersionId : null,
    usedSnapshotId: used ? used.id : null,
    resumeLatest,
    outdated:
      !!used &&
      !!resumeLatest &&
      resumeLatest.id !== used.id &&
      resumeLatest.id !== version.dismissedResumeSnapshotId,
  };
}
