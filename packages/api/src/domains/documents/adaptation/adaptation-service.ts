import { TRPCError } from "@trpc/server";

import {
  getUserCipher,
  type UserCipher,
} from "@repo/api/domains/encryption/user-cipher";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "../documents-repository";
import { requireUserVersion } from "../require-version";
import type { OutputLanguage } from "../schemas/document";
import {
  type ResumeContent,
  resumeContentSchema,
} from "../schemas/resume-content";
import { syncChanges, type SyncChange } from "./three-way-merge";

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

type Version = NonNullable<
  Awaited<ReturnType<DocumentsRepository["findVersion"]>>
>;
type Snapshot = NonNullable<
  Awaited<ReturnType<DocumentsRepository["findSnapshot"]>>
>;

/**
 * The two snapshots a sync compares against, for a target and the version
 * it receives changes from: the source snapshot last carried into the
 * target (the base), and the target's snapshot that carrying produced.
 * The link goes either way: the target was adapted from the source, or the
 * source from the target. Null when the versions are not linked.
 */
export async function syncBases(
  repository: DocumentsRepository,
  target: Version,
  from: Version
): Promise<{ base: Snapshot | null; targetBase: Snapshot | null } | null> {
  if (target.adaptedFromVersionId === from.id) {
    return {
      base: await repository.snapshotOrAncestor({
        versionId: from.id,
        snapshotId: target.syncBaseSnapshotId,
        sequence: target.syncBaseSequence,
      }),
      targetBase: await repository.snapshotOrAncestor({
        versionId: target.id,
        snapshotId: target.syncTargetSnapshotId,
        sequence: target.syncTargetSequence,
      }),
    };
  }
  if (from.adaptedFromVersionId === target.id) {
    return {
      base: await repository.snapshotOrAncestor({
        versionId: from.id,
        snapshotId: from.syncTargetSnapshotId,
        sequence: from.syncTargetSequence,
      }),
      targetBase: await repository.snapshotOrAncestor({
        versionId: target.id,
        snapshotId: from.syncBaseSnapshotId,
        sequence: from.syncBaseSequence,
      }),
    };
  }
  return null;
}

/**
 * Adaptations and language sync from the user's side (resume spec,
 * "Adaptations" and "Language sync"): adapting into a new version or
 * recreating an existing one, listing a sync's changes, carrying the
 * selected ones as a proposal, and accepting or discarding it.
 */
export class AdaptationService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db)
  ) {}

  private decrypt(cipher: UserCipher, snapshot: Snapshot): ResumeContent {
    return resumeContentSchema.parse(
      JSON.parse(cipher.decrypt(snapshot.encryptedContent))
    );
  }

  /**
   * Adapts a version's latest snapshot into another language: a new
   * version linked for sync, or, with a target, its recreation.
   */
  async adapt(input: {
    userId: string;
    versionId: string;
    language: OutputLanguage;
    targetVersionId?: string;
  }): Promise<{ generationId: string; realtime: RealtimeSubscription }> {
    const generation = await this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const { version, document, profile } = await requireUserVersion(
        tx,
        input.userId,
        input.versionId
      );
      const target = input.targetVersionId
        ? await repository.findVersion(input.targetVersionId)
        : null;
      if (
        input.targetVersionId &&
        (target?.documentId !== document.id || target.id === version.id)
      ) {
        throw notFound();
      }
      const source = await repository.latestSnapshot(version.id);
      if (!source) throw notFound();
      const application = document.applicationId
        ? await repository.findApplication(document.applicationId)
        : null;
      return repository.insertGeneration({
        profileId: profile.id,
        documentId: document.id,
        kind: "adapt",
        versionId: target?.id ?? null,
        language: target?.language ?? input.language,
        sourceVersionId: version.id,
        sourceSnapshotId: source.id,
        reviewDepth: "quick",
        writingLevel: "standard",
        tone: application?.tone ?? "your_style",
      });
    });
    const { realtime } = await this.tasks.start({
      userId: input.userId,
      type: "adapt_document",
      subjectId: generation.id,
    });
    return { generationId: generation.id, realtime };
  }

  /** The source's changes the target has not received, one by one. */
  async syncPreview(input: {
    userId: string;
    versionId: string;
    fromVersionId: string;
  }): Promise<{ changes: SyncChange[]; baseMissing: boolean }> {
    return this.db.transaction(async (tx) => {
      const { changes } = await this.planSync(tx, input);
      return { changes: changes ?? [], baseMissing: changes === null };
    });
  }

  private async planSync(
    tx: DbClient,
    input: { userId: string; versionId: string; fromVersionId: string }
  ) {
    const repository = new DocumentsRepository(tx);
    const {
      version: target,
      document,
      profile,
    } = await requireUserVersion(tx, input.userId, input.versionId);
    const from = await repository.findVersion(input.fromVersionId);
    if (from?.documentId !== document.id) throw notFound();
    const bases = await syncBases(repository, target, from);
    if (!bases) throw new TRPCError({ code: "BAD_REQUEST" });
    const source = await repository.latestSnapshot(from.id);
    const current = await repository.latestSnapshot(target.id);
    if (!source || !current) throw notFound();
    const cipher = await getUserCipher(tx, input.userId);
    // No ancestor left on either side: only recreating can link them again.
    const changes =
      bases.base && bases.targetBase
        ? syncChanges({
            base: this.decrypt(cipher, bases.base),
            source: this.decrypt(cipher, source),
            targetBase: this.decrypt(cipher, bases.targetBase),
            target: this.decrypt(cipher, current),
          })
        : null;
    return {
      changes,
      target,
      from,
      document,
      profile,
      source,
      current,
      cipher,
    };
  }

  /**
   * Carries the selected changes in a task; a conflict the user resolved
   * for the target's wording is simply not selected.
   */
  async startSync(input: {
    userId: string;
    versionId: string;
    fromVersionId: string;
    lineIds: string[];
  }): Promise<{ generationId: string; realtime: RealtimeSubscription }> {
    const generation = await this.db.transaction(async (tx) => {
      const plan = await this.planSync(tx, input);
      const selected = (plan.changes ?? []).filter((change) =>
        input.lineIds.includes(change.lineId)
      );
      if (selected.length === 0) throw new TRPCError({ code: "BAD_REQUEST" });
      const application = plan.document.applicationId
        ? await new DocumentsRepository(tx).findApplication(
            plan.document.applicationId
          )
        : null;
      return new DocumentsRepository(tx).insertGeneration({
        profileId: plan.profile.id,
        documentId: plan.document.id,
        kind: "sync",
        versionId: plan.target.id,
        language: plan.target.language,
        sourceVersionId: plan.from.id,
        sourceSnapshotId: plan.source.id,
        targetSnapshotId: plan.current.id,
        encryptedSyncPlan: plan.cipher.encrypt(
          JSON.stringify({ changes: selected })
        ),
        reviewDepth: "quick",
        writingLevel: "standard",
        tone: application?.tone ?? "your_style",
      });
    });
    const { realtime } = await this.tasks.start({
      userId: input.userId,
      type: "adapt_document",
      subjectId: generation.id,
    });
    return { generationId: generation.id, realtime };
  }

  private async requireProposal(
    tx: DbClient,
    userId: string,
    generationId: string
  ) {
    const repository = new DocumentsRepository(tx);
    const generation = await repository.findGeneration(generationId);
    if (generation?.kind !== "sync" || !generation.versionId) throw notFound();
    const { version, profile } = await requireUserVersion(
      tx,
      userId,
      generation.versionId,
      { lock: true }
    );
    if (generation.profileId !== profile.id) throw notFound();
    if (generation.status !== "proposed" || !generation.encryptedProposal) {
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    }
    return { generation, version };
  }

  /**
   * Accepting a sync proposal makes it the target's new latest snapshot
   * and records the source snapshot as the pair's new base. The target
   * must not have changed since the proposal was made.
   */
  async acceptSync(input: { userId: string; generationId: string }) {
    return this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const { generation, version } = await this.requireProposal(
        tx,
        input.userId,
        input.generationId
      );
      const latest = await repository.latestSnapshot(version.id);
      if (latest?.id !== generation.targetSnapshotId) {
        throw new TRPCError({ code: "CONFLICT" });
      }
      const snapshot = await repository.insertSnapshot({
        versionId: version.id,
        sequence: latest.sequence + 1,
        parentSnapshotId: latest.id,
        origin: "adapted",
        author: "ai",
        encryptedContent: generation.encryptedProposal!,
        generationId: generation.id,
      });
      const source = generation.sourceSnapshotId
        ? await repository.findSnapshot(generation.sourceSnapshotId)
        : null;
      const sourceVersion = generation.sourceVersionId
        ? await repository.findVersion(generation.sourceVersionId)
        : null;
      if (version.adaptedFromVersionId === generation.sourceVersionId) {
        await repository.updateVersion(version.id, {
          syncBaseSnapshotId: source?.id ?? null,
          syncBaseSequence: source?.sequence ?? null,
          syncTargetSnapshotId: snapshot.id,
          syncTargetSequence: snapshot.sequence,
        });
      } else if (sourceVersion?.adaptedFromVersionId === version.id) {
        await repository.updateVersion(sourceVersion.id, {
          syncBaseSnapshotId: snapshot.id,
          syncBaseSequence: snapshot.sequence,
          syncTargetSnapshotId: source?.id ?? null,
          syncTargetSequence: source?.sequence ?? null,
        });
      }
      await repository.updateGeneration(generation.id, {
        status: "completed",
        snapshotId: snapshot.id,
        encryptedProposal: null,
      });
      return { snapshotId: snapshot.id };
    });
  }

  async discardSync(input: { userId: string; generationId: string }) {
    await this.db.transaction(async (tx) => {
      const { generation } = await this.requireProposal(
        tx,
        input.userId,
        input.generationId
      );
      await new DocumentsRepository(tx).updateGeneration(generation.id, {
        status: "discarded",
        encryptedProposal: null,
      });
    });
  }

  /**
   * Approves a position's title in the version's language (edited or as
   * proposed): from now on it is a locked fact there. The version gets a
   * new snapshot printing it.
   */
  async approveTitle(input: {
    userId: string;
    versionId: string;
    positionId: string;
    title: string;
  }) {
    return this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const { version, profile } = await requireUserVersion(
        tx,
        input.userId,
        input.versionId,
        { lock: true }
      );
      const latest = await repository.latestSnapshot(version.id);
      if (!latest) throw notFound();
      const cipher = await getUserCipher(tx, input.userId);
      const content = this.decrypt(cipher, latest);
      const title = input.title.trim();
      const printed = content.sections.some(
        (section) =>
          section.kind === "experience" &&
          section.entries.some((entry) => entry.positionId === input.positionId)
      );
      if (!printed || !title) throw new TRPCError({ code: "BAD_REQUEST" });
      await repository.approveTitleEquivalent({
        profileId: profile.id,
        positionId: input.positionId,
        language: version.language,
        encryptedTitle: cipher.encrypt(title),
        approvedAt: new Date(),
      });
      const titled: ResumeContent = {
        ...content,
        sections: content.sections.map((section) =>
          section.kind === "experience"
            ? {
                ...section,
                entries: section.entries.map((entry) =>
                  entry.positionId === input.positionId
                    ? { ...entry, title }
                    : entry
                ),
              }
            : section
        ),
      };
      const snapshot = await repository.insertSnapshot({
        versionId: version.id,
        sequence: latest.sequence + 1,
        parentSnapshotId: latest.id,
        origin: "edited",
        author: "user",
        encryptedContent: cipher.encrypt(JSON.stringify(titled)),
      });
      // A title is a locked fact, never carried by sync: a pair that was in
      // sync stays in sync.
      const moved = { snapshotId: snapshot.id, sequence: snapshot.sequence };
      for (const linked of await repository.listVersions([
        version.documentId,
      ])) {
        if (
          linked.id === version.id &&
          linked.syncTargetSnapshotId === latest.id
        ) {
          await repository.updateVersion(linked.id, {
            syncTargetSnapshotId: moved.snapshotId,
            syncTargetSequence: moved.sequence,
          });
        }
        if (
          linked.adaptedFromVersionId === version.id &&
          linked.syncBaseSnapshotId === latest.id
        ) {
          await repository.updateVersion(linked.id, {
            syncBaseSnapshotId: moved.snapshotId,
            syncBaseSequence: moved.sequence,
          });
        }
      }
      return { snapshotId: snapshot.id };
    });
  }
}
