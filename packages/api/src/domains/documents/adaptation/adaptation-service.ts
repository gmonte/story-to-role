import { TRPCError } from "@trpc/server";

import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "../documents-repository";
import { requireUserVersion } from "../require-version";
import { decryptDocument, decryptResume } from "../snapshot-content";
import type { OutputLanguage } from "../schemas/document";
import type { ResumeContent } from "../schemas/resume-content";
import { syncBases } from "./sync-link";
import { type SyncChange, syncChanges } from "./three-way-merge";

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

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

  /** Starts an adapt or sync generation for a document, in a task. */
  private async start(
    userId: string,
    insert: (tx: DbClient) => Promise<{ id: string }>
  ): Promise<{ generationId: string; realtime: RealtimeSubscription }> {
    const generation = await this.db.transaction(insert);
    const { realtime } = await this.tasks.start({
      userId,
      type: "adapt_document",
      subjectId: generation.id,
    });
    return { generationId: generation.id, realtime };
  }

  private async toneOf(
    repository: DocumentsRepository,
    applicationId: string | null
  ) {
    const application = applicationId
      ? await repository.findApplication(applicationId)
      : null;
    return application?.tone ?? "your_style";
  }

  /**
   * Adapts a version's latest snapshot into another language: a new
   * version linked for sync, or, with a target, its recreation. An
   * adaptation is always into another language.
   */
  adapt(input: {
    userId: string;
    versionId: string;
    language: OutputLanguage;
    targetVersionId?: string;
  }) {
    return this.start(input.userId, async (tx) => {
      const repository = new DocumentsRepository(tx);
      const { version, document, profile } = await requireUserVersion(
        tx,
        input.userId,
        input.versionId
      );
      // Cover letters adapt with their own rules, not this one's yet.
      if (document.kind !== "resume") {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      const target = input.targetVersionId
        ? await repository.findVersion(input.targetVersionId)
        : null;
      if (input.targetVersionId && target?.documentId !== document.id) {
        throw notFound();
      }
      const language = target?.language ?? input.language;
      if (language === version.language) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      const source = await repository.latestSnapshot(version.id);
      if (!source) throw notFound();
      return repository.insertGeneration({
        profileId: profile.id,
        documentId: document.id,
        kind: "adapt",
        versionId: target?.id ?? null,
        language,
        sourceVersionId: version.id,
        sourceSnapshotId: source.id,
        sourceSnapshotSequence: source.sequence,
        reviewDepth: "quick",
        writingLevel: "standard",
        tone: await this.toneOf(repository, document.applicationId),
      });
    });
  }

  /** The source's changes the target has not received, one by one. */
  async syncPreview(input: {
    userId: string;
    versionId: string;
    fromVersionId: string;
  }): Promise<{
    changes: SyncChange[];
    baseMissing: boolean;
    sourceSnapshotId: string;
  }> {
    return this.db.transaction(async (tx) => {
      const plan = await this.planSync(tx, input);
      return {
        changes: plan.changes ?? [],
        baseMissing: plan.changes === null,
        sourceSnapshotId: plan.source.id,
      };
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
    if (document.kind !== "resume")
      throw new TRPCError({ code: "BAD_REQUEST" });
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
            base: decryptResume(cipher, bases.base),
            source: decryptResume(cipher, source),
            targetBase: decryptResume(cipher, bases.targetBase),
            target: decryptResume(cipher, current),
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
   * for the target's wording is simply not selected. The source must still
   * be the snapshot the user previewed, so nothing unseen is carried.
   */
  startSync(input: {
    userId: string;
    versionId: string;
    fromVersionId: string;
    sourceSnapshotId: string;
    lineIds: string[];
  }) {
    return this.start(input.userId, async (tx) => {
      const plan = await this.planSync(tx, input);
      if (plan.source.id !== input.sourceSnapshotId) {
        throw new TRPCError({ code: "CONFLICT" });
      }
      const selected = (plan.changes ?? []).filter((change) =>
        input.lineIds.includes(change.lineId)
      );
      if (selected.length === 0) throw new TRPCError({ code: "BAD_REQUEST" });
      const repository = new DocumentsRepository(tx);
      return repository.insertGeneration({
        profileId: plan.profile.id,
        documentId: plan.document.id,
        kind: "sync",
        versionId: plan.target.id,
        language: plan.target.language,
        sourceVersionId: plan.from.id,
        sourceSnapshotId: plan.source.id,
        sourceSnapshotSequence: plan.source.sequence,
        targetSnapshotId: plan.current.id,
        encryptedSyncPlan: plan.cipher.encrypt(
          JSON.stringify({ changes: selected })
        ),
        reviewDepth: "quick",
        writingLevel: "standard",
        tone: await this.toneOf(repository, plan.document.applicationId),
      });
    });
  }

  /** The proposal, read again once its target version is locked. */
  private async requireProposal(
    tx: DbClient,
    userId: string,
    generationId: string
  ) {
    const repository = new DocumentsRepository(tx);
    const found = await repository.findGeneration(generationId);
    // A language sync, or a cover letter adjusted to its resume.
    if (
      (found?.kind !== "sync" && found?.kind !== "letter_update") ||
      !found.versionId
    ) {
      throw notFound();
    }
    const { version, profile } = await requireUserVersion(
      tx,
      userId,
      found.versionId,
      { lock: true }
    );
    const generation = await repository.findGeneration(generationId);
    if (generation?.profileId !== profile.id) throw notFound();
    if (generation.status !== "proposed" || !generation.encryptedProposal) {
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    }
    return { generation, version };
  }

  /**
   * Accepting a sync proposal makes it the target's new latest snapshot;
   * written by the sync's generation, it is the pair's new base. The target
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
      const isLetter = generation.kind === "letter_update";
      const snapshot = await repository.insertSnapshot({
        versionId: version.id,
        sequence: latest.sequence + 1,
        parentSnapshotId: latest.id,
        // A letter update is a same-language revision, not an adaptation.
        origin: isLetter ? "generated" : "adapted",
        author: "ai",
        encryptedContent: generation.encryptedProposal!,
        generationId: generation.id,
        // The letter now follows the resume snapshot it was updated from.
        ...(isLetter && {
          resumeVersionId: generation.resumeVersionId,
          resumeSnapshotId: generation.resumeSnapshotId,
          motivationSkipped: latest.motivationSkipped,
        }),
      });
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
   * new snapshot printing it; a title is never carried by sync.
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
      const content = decryptDocument(cipher, latest);
      // Titles are a resume's locked facts.
      if (content.kind !== "resume")
        throw new TRPCError({ code: "BAD_REQUEST" });
      const title = input.title.trim();
      const printed = content.sections.some(
        (section) =>
          section.kind === "experience" &&
          section.entries.some((entry) => entry.positionId === input.positionId)
      );
      if (!printed) throw new TRPCError({ code: "BAD_REQUEST" });
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
      return { snapshotId: snapshot.id };
    });
  }
}
