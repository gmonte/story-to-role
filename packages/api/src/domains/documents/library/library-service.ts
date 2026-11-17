import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";
import { loadSensitiveFilter } from "@repo/api/domains/evidence/sensitive/load-sensitive-filter";

import { DocumentsRepository } from "../documents-repository";
import { failGeneration } from "../documents-service";
import { freezeGeneration } from "../generation/generation-request";
import { loadCareerContext } from "../generation/load-career-context";
import type { GenerationSettings } from "../schemas/generation-settings";
import { relockFacts } from "../generation/resume-checks";
import { decryptResume } from "../snapshot-content";
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
   * Generates a library resume from the published profile: a new document with
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
    /** What the user changed in the settings form, for this document. */
    settings?: Partial<GenerationSettings>;
  }): Promise<{
    documentId: string;
    generationId: string;
    realtime: RealtimeSubscription;
  }> {
    const profile = await this.requireProfile(input.userId);
    const frozen = await freezeGeneration({
      db: this.db,
      cipher: await getUserCipher(this.db, input.userId),
      userId: input.userId,
      profileId: profile.id,
      settings: input.settings,
    });
    const hints = {
      positions: frozen.positions,
      thorough: input.reviewDepth === "thorough",
      maximum: input.writingLevel === "maximum",
    };
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "generate_document",
      hints,
    });
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
        profileVersionId: frozen.profileVersionId,
        settings: frozen.settings,
        language: existing?.version.language ?? input.language,
        reviewDepth: input.reviewDepth,
        writingLevel: input.writingLevel,
        tone: input.tone,
      });
    });
    const { realtime } = await this.tasks.startOrUndo(
      {
        userId: input.userId,
        type: "generate_document",
        subjectId: generation.id,
        hints,
      },
      () => failGeneration(this.db, generation.id)
    );
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
      const ownApplication = await repository.findApplicationByOpening(
        opening.id
      );
      const cipher = await getUserCipher(tx, input.userId);
      const decrypt = (value: string | null) =>
        value ? cipher.decrypt(value) : null;
      // Ranked by document: its closest version stands for it.
      const rows = (
        await repository.similarVersions({
          profileId: profile.id,
          embedding: opening.embedding,
          excludeApplicationId: ownApplication?.id ?? null,
          limit: similarLimit * 4,
        })
      )
        .filter(
          (row, index, all) =>
            all.findIndex((other) => other.document.id === row.document.id) ===
            index
        )
        .slice(0, similarLimit);
      const similar: SimilarDocument[] = [];
      for (const { version, document } of rows) {
        const application = document.applicationId
          ? await repository.findApplication(document.applicationId)
          : null;
        const otherOpening =
          application &&
          (await openings.findOpeningById(application.openingId));
        similar.push({
          versionId: version.id,
          documentId: document.id,
          language: version.language,
          label: decrypt(version.encryptedLabel),
          source:
            application && otherOpening
              ? {
                  kind: "application",
                  openingId: otherOpening.id,
                  title: decrypt(otherOpening.encryptedTitle),
                  company: decrypt(otherOpening.encryptedCompany),
                  status: application.status,
                }
              : {
                  kind: "library",
                  focus: decrypt(document.encryptedFocus) ?? "",
                },
        });
      }
      return similar;
    });
  }

  /**
   * "Use as is" (resume spec, "Flow"): the version's latest snapshot
   * becomes a new version of this opening's resume, which starts its
   * application. Its locked facts become this application's (another
   * application's overrides stay there). In another language than the
   * output language it is adapted instead, which counts as a generation.
   */
  async copyIntoApplication(input: {
    userId: string;
    openingId: string;
    versionId: string;
    language: OutputLanguage;
  }): Promise<{
    versionId: string | null;
    generationId: string | null;
    realtime: RealtimeSubscription | null;
  }> {
    const profile = await this.requireProfile(input.userId);
    const result = await this.db.transaction(async (tx) => {
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
      if (source.language !== input.language) {
        const generation = await repository.insertGeneration({
          profileId: profile.id,
          documentId: document.id,
          kind: "adapt",
          language: input.language,
          sourceVersionId: source.id,
          sourceSnapshotId: latest.id,
          sourceSnapshotSequence: latest.sequence,
          reviewDepth: "quick",
          writingLevel: "standard",
          tone: application.tone,
        });
        return { versionId: null, generationId: generation.id };
      }
      const cipher = await getUserCipher(tx, input.userId);
      // The copy is of that text, so of the profile version it was
      // written from: its locked facts are read from there.
      const filter = await loadSensitiveFilter({
        db: tx,
        cipher,
        profileId: profile.id,
        profileVersionId: latest.profileVersionId,
      });
      const context = await loadCareerContext({
        db: tx,
        cipher,
        profileId: profile.id,
        filter,
        profileVersionId: latest.profileVersionId,
        openingId: opening.id,
        language: source.language,
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
        encryptedContent: cipher.encrypt(
          JSON.stringify(
            relockFacts(decryptResume(cipher, latest), context.positions)
          )
        ),
        profileVersionId: latest.profileVersionId,
      });
      return { versionId: version.id, generationId: null };
    });
    if (!result.generationId) return { ...result, realtime: null };
    const { realtime } = await this.tasks.start({
      userId: input.userId,
      type: "adapt_document",
      subjectId: result.generationId,
    });
    return { ...result, realtime };
  }
}
