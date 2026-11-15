import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "../documents-repository";
import { requireUserVersion } from "../require-version";
import type {
  OutputLanguage,
  ReviewDepth,
  WritingLevel,
} from "../schemas/document";
import type { LibraryDocument, SimilarDocument } from "../schemas/library";

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

/** How many similar documents an opening suggests. */
const similarLimit = 3;

/**
 * Library documents and reuse across applications (resume spec, "Openings
 * and library documents" and "Flow"): resumes with no company behind them,
 * each titled by its focus, and the documents an opening finds similar,
 * used as they are or as a reference.
 */
export class LibraryService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db)
  ) {}

  private async requireProfile(userId: string) {
    const profile = await new CareerRepository(this.db).findProfileByUserId(
      userId
    );
    if (!profile) throw notFound();
    return profile;
  }

  async list(input: { userId: string }): Promise<LibraryDocument[]> {
    const profile = await this.requireProfile(input.userId);
    return this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const cipher = await getUserCipher(tx, input.userId);
      const documents = await repository.listLibraryDocuments(profile.id);
      const versions = await repository.listVersions(
        documents.map((document) => document.id)
      );
      return documents.map((document) => ({
        id: document.id,
        kind: document.kind,
        focus: document.encryptedFocus
          ? cipher.decrypt(document.encryptedFocus)
          : "",
        languages: [
          ...new Set(
            versions
              .filter((version) => version.documentId === document.id)
              .map((version) => version.language)
          ),
        ],
        createdAt: document.createdAt,
      }));
    });
  }

  /**
   * Generates a library resume from the evidence base: a new document with
   * its focus, or, with a version, that version's new snapshot. It never
   * starts an application.
   */
  async generateResume(input: {
    userId: string;
    focus?: string;
    versionId?: string;
    language: OutputLanguage;
    reviewDepth: ReviewDepth;
    writingLevel: WritingLevel;
    tone: Tone;
  }): Promise<{
    documentId: string;
    generationId: string;
    realtime: RealtimeSubscription;
  }> {
    const profile = await this.requireProfile(input.userId);
    const generation = await this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const existing = input.versionId
        ? await requireUserVersion(tx, input.userId, input.versionId)
        : null;
      if (existing?.document.applicationId) throw notFound();
      const focus = input.focus?.trim();
      if (!existing && !focus) throw new TRPCError({ code: "BAD_REQUEST" });
      const cipher = await getUserCipher(tx, input.userId);
      const document =
        existing?.document ??
        (await repository.insertDocument({
          profileId: profile.id,
          kind: "resume",
          encryptedFocus: cipher.encrypt(focus!),
        }));
      return repository.insertGeneration({
        profileId: profile.id,
        documentId: document.id,
        versionId: existing?.version.id ?? null,
        language: existing?.version.language ?? input.language,
        reviewDepth: input.reviewDepth,
        writingLevel: input.writingLevel,
        tone: input.tone,
      });
    });
    const { realtime } = await this.tasks.start({
      userId: input.userId,
      type: "generate_document",
      subjectId: generation.id,
    });
    return {
      documentId: generation.documentId,
      generationId: generation.id,
      realtime,
    };
  }

  /**
   * Documents similar to an opening, by vector similarity between the
   * opening and each version: library documents and other applications'
   * documents, sent ones included. Empty until the opening is analyzed.
   */
  async similarForOpening(input: {
    userId: string;
    openingId: string;
  }): Promise<SimilarDocument[]> {
    const profile = await this.requireProfile(input.userId);
    return this.db.transaction(async (tx) => {
      const openings = new OpeningsRepository(tx);
      const opening = await openings.findOpening({
        profileId: profile.id,
        openingId: input.openingId,
      });
      if (!opening) throw notFound();
      if (!opening.embedding) return [];
      const repository = new DocumentsRepository(tx);
      const own = await repository.findApplicationByOpening(opening.id);
      const cipher = await getUserCipher(tx, input.userId);
      const open = (value: string | null) =>
        value ? cipher.decrypt(value) : null;
      const rows = await repository.similarVersions({
        profileId: profile.id,
        embedding: opening.embedding,
        excludeApplicationId: own?.id ?? null,
        limit: similarLimit,
      });
      const similar: SimilarDocument[] = [];
      for (const { version, document } of rows) {
        const application = document.applicationId
          ? await repository.findApplication(document.applicationId)
          : null;
        const other =
          application &&
          (await openings.findOpeningById(application.openingId));
        similar.push({
          versionId: version.id,
          documentId: document.id,
          language: version.language,
          label: open(version.encryptedLabel),
          source:
            application && other
              ? {
                  kind: "application",
                  openingId: other.id,
                  title: open(other.encryptedTitle),
                  company: open(other.encryptedCompany),
                  status: application.status,
                }
              : { kind: "library", focus: open(document.encryptedFocus) ?? "" },
        });
      }
      return similar;
    });
  }

  /**
   * "Use as is": the version's latest snapshot becomes a new version of
   * this opening's resume, which starts its application (resume spec,
   * "Flow": applications start with the first generated or copied document).
   */
  async copyIntoApplication(input: {
    userId: string;
    openingId: string;
    versionId: string;
  }): Promise<{ versionId: string }> {
    const profile = await this.requireProfile(input.userId);
    return this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const opening = await new OpeningsRepository(tx).findOpening({
        profileId: profile.id,
        openingId: input.openingId,
      });
      if (!opening) throw notFound();
      const { version: source, document: from } = await requireUserVersion(
        tx,
        input.userId,
        input.versionId
      );
      if (from.kind !== "resume") throw new TRPCError({ code: "BAD_REQUEST" });
      const latest = await repository.latestSnapshot(source.id);
      if (!latest) throw notFound();
      const application = await repository.findOrInsertApplication({
        profileId: profile.id,
        openingId: opening.id,
      });
      const document = await repository.findOrInsertApplicationDocument({
        profileId: profile.id,
        applicationId: application.id,
        kind: "resume",
      });
      const version = await repository.insertVersion({
        documentId: document.id,
        language: source.language,
      });
      await repository.insertSnapshot({
        versionId: version.id,
        sequence: 1,
        parentSnapshotId: null,
        origin: "copied",
        author: "user",
        encryptedContent: latest.encryptedContent,
      });
      return { versionId: version.id };
    });
  }
}
