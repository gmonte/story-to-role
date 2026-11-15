import { TRPCError } from "@trpc/server";

import { InstructionsRepository } from "@repo/api/domains/applications/instructions-repository";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import {
  getUserCipher,
  type UserCipher,
} from "@repo/api/domains/encryption/user-cipher";
import { EvidenceRepository } from "@repo/api/domains/evidence/evidence-repository";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";
import { getStorage, type Storage } from "@repo/api/tools/storage/storage";
import { MotivationRepository } from "@repo/api/domains/applications/motivation/motivation-repository";
import { ResearchRepository } from "@repo/api/domains/applications/research/research-repository";

import { DocumentsRepository } from "./documents-repository";
import { outdatedVersions } from "./adaptation/sync-status";
import { proposalDiff } from "./adaptation/three-way-merge";
import { fileNamer } from "./rendering/file-namer";
import { pdfTemplate } from "./rendering/pdf-template";
import { requireUserVersion } from "./require-version";
import { decryptDocument } from "./snapshot-content";
import { applyLetterEdit, estimateLetterPages } from "./letter/assemble-letter";
import type { CoverLetterContent } from "./schemas/cover-letter-content";
import type { DocumentContent } from "./schemas/document-content";
import { documentLines } from "./document-text";
import {
  letterResumeState,
  resumeLinkOf,
  type ResumeLink,
} from "./letter/letter-resume";
import { applyUserEdit, LockedFactEditError } from "./editing/apply-user-edit";
import { atsCheck } from "./generation/ats-check";
import { estimatePages, resumeText } from "./generation/resume-checks";
import type {
  OutputLanguage,
  ReviewDepth,
  WritingLevel,
} from "./schemas/document";
import type {
  DocumentView,
  EvidenceTrace,
  OpeningDocuments,
  SnapshotSummary,
  VersionView,
} from "./schemas/document-view";
import type {
  ResumeContent,
  ResumeSectionKind,
} from "./schemas/resume-content";

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

type TraceSource = Awaited<ReturnType<DocumentsService["traceSource"]>>;

/**
 * Documents from the user's side (resume spec, "Versions and snapshots"):
 * generation starts the application, every change is an immutable
 * snapshot, the latest snapshot of each version is the official one and
 * undo deletes only the latest.
 */
export class DocumentsService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db),
    private readonly storage?: Storage
  ) {}

  private async requireProfile(userId: string, db: DbClient = this.db) {
    const profile = await new CareerRepository(db).findProfileByUserId(userId);
    if (!profile) throw notFound();
    return profile;
  }

  /**
   * Starts generating a resume for an analyzed opening; the first one
   * starts the application. Into an existing version it becomes that
   * version's new snapshot; otherwise a new version is created.
   */
  async generateResume(input: {
    userId: string;
    openingId: string;
    language: OutputLanguage;
    reviewDepth: ReviewDepth;
    writingLevel: WritingLevel;
    tone: Tone;
    versionId?: string;
    /** Sections forced in or out for this application only. */
    sectionsForcedIn?: ResumeSectionKind[];
    sectionsForcedOut?: ResumeSectionKind[];
    /** "Use as reference": a similar version of the user's, to guide the draft. */
    referenceVersionId?: string;
  }): Promise<{ generationId: string; realtime: RealtimeSubscription }> {
    const profile = await this.requireProfile(input.userId);
    // What it may cost depends on career length, depth and level.
    const hints = {
      positions: (
        await new CareerRepository(this.db).listPositions(profile.id)
      ).filter((position) => position.status === "approved").length,
      thorough: input.reviewDepth === "thorough",
      maximum: input.writingLevel === "maximum",
    };
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "generate_document",
      hints,
    });
    const generation = await this.db.transaction(async (tx) => {
      const opening = await new OpeningsRepository(tx).findOpening({
        profileId: profile.id,
        openingId: input.openingId,
      });
      if (!opening) throw notFound();
      if (opening.status !== "analyzed") {
        throw new TRPCError({ code: "PRECONDITION_FAILED" });
      }
      // Instructions are reviewed point by point before generating.
      const instructions = new InstructionsRepository(tx);
      const latest = await instructions.latestInstructions(opening.id);
      const points = await instructions.listPoints(opening.id);
      const overrides = await instructions.listOverrides(opening.id);
      if (
        latest?.status === "splitting" ||
        points.some((point) => point.status === "draft") ||
        overrides.some((row) => !row.confirmedAt)
      ) {
        throw new TRPCError({ code: "PRECONDITION_FAILED" });
      }
      const repository = new DocumentsRepository(tx);
      const application = await repository.findOrInsertApplication({
        profileId: profile.id,
        openingId: opening.id,
      });
      const forcedIn = input.sectionsForcedIn ?? application.sectionsForcedIn;
      await repository.updateApplication(application.id, {
        tone: input.tone,
        sectionsForcedIn: forcedIn,
        sectionsForcedOut: (
          input.sectionsForcedOut ?? application.sectionsForcedOut
        ).filter((kind) => !forcedIn.includes(kind)),
      });
      const document = await repository.findOrInsertApplicationDocument({
        profileId: profile.id,
        applicationId: application.id,
        kind: "resume",
      });
      if (input.versionId) {
        const version = await repository.findVersion(input.versionId);
        if (version?.documentId !== document.id) throw notFound();
      }
      const referenced = input.referenceVersionId
        ? await requireUserVersion(tx, input.userId, input.referenceVersionId)
        : null;
      if (referenced && referenced.document.kind !== "resume") {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      const reference =
        referenced && (await repository.latestSnapshot(referenced.version.id));
      return repository.insertGeneration({
        profileId: profile.id,
        documentId: document.id,
        versionId: input.versionId ?? null,
        referenceSnapshotId: reference?.id ?? null,
        language: input.language,
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
    return { generationId: generation.id, realtime };
  }

  /** The opening's application and documents, each version official. */
  async forOpening(input: {
    userId: string;
    openingId: string;
  }): Promise<OpeningDocuments> {
    const profile = await this.requireProfile(input.userId);
    return this.db.transaction(async (tx) => {
      const opening = await new OpeningsRepository(tx).findOpening({
        profileId: profile.id,
        openingId: input.openingId,
      });
      if (!opening) throw notFound();
      const repository = new DocumentsRepository(tx);
      const application = await repository.findApplicationByOpening(opening.id);
      if (!application) return { application: null, documents: [] };
      const cipher = await getUserCipher(tx, input.userId);
      const keywords = await this.keywordsWithEvidence(tx, cipher, opening.id);
      const trace = await this.traceSource(tx, cipher, profile.id, opening.id);
      const documents = await repository.listApplicationDocuments(
        application.id
      );
      return {
        application: {
          id: application.id,
          status: application.status,
          tone: application.tone,
          sectionsForcedIn: application.sectionsForcedIn,
          sectionsForcedOut: application.sectionsForcedOut,
        },
        documents: await Promise.all(
          documents.map((document) =>
            this.documentView(tx, cipher, document, keywords, trace)
          )
        ),
      };
    });
  }

  /** A library document, as the editor shows it (no opening, no ATS check). */
  async libraryDocument(input: {
    userId: string;
    documentId: string;
  }): Promise<DocumentView> {
    const profile = await this.requireProfile(input.userId);
    return this.db.transaction(async (tx) => {
      const document = await new DocumentsRepository(tx).findDocument(
        input.documentId
      );
      if (document?.profileId !== profile.id || document.applicationId) {
        throw notFound();
      }
      const cipher = await getUserCipher(tx, input.userId);
      const trace = await this.traceSource(tx, cipher, profile.id, null);
      return this.documentView(tx, cipher, document, null, trace);
    });
  }

  private async documentView(
    tx: DbClient,
    cipher: UserCipher,
    document: Parameters<typeof fileNamer>[2] & { id: string },
    keywords: Array<{ term: string; backedByEvidence: boolean }> | null,
    trace: TraceSource
  ): Promise<DocumentView> {
    const nameFor = await fileNamer(tx, cipher, document);
    const repository = new DocumentsRepository(tx);
    const versions = await repository.listVersions([document.id]);
    const generation = await repository.latestGeneration(document.id);
    const outdated = await outdatedVersions(repository, cipher, versions);
    const views: VersionView[] = [];
    for (const version of versions) {
      const latest = await repository.latestSnapshot(version.id);
      if (!latest) continue;
      const content = decryptDocument(cipher, latest);
      const rendered = await repository.findRenderedFile(
        latest.id,
        pdfTemplate
      );
      const isResume = content.kind === "resume";
      views.push({
        id: version.id,
        language: version.language,
        label: version.encryptedLabel
          ? cipher.decrypt(version.encryptedLabel)
          : null,
        snapshot: summary(latest),
        snapshotCount: await repository.countSnapshots(version.id),
        content,
        // The rendered PDF's real length once it exists; an estimate before.
        pages:
          rendered?.pages ??
          (isResume ? estimatePages(content) : estimateLetterPages(content)),
        pdf: {
          ready: !!rendered,
          rendering:
            !rendered &&
            !!(await new TasksRepository(tx).activeTask(
              latest.id,
              "render_pdf"
            )),
          fileName: nameFor(version, content),
        },
        atsCheck:
          keywords && isResume
            ? atsCheck({ text: resumeText(content), keywords })
            : null,
        trace: trace.evidenceFor(content),
        instructionTrace: trace.instructionsFor(content),
        credentialApprovals: trace.credentialApprovals,
        outdated: outdated.get(version.id) ?? [],
        titleProposals: isResume
          ? trace.titleProposalsFor(content, version.language)
          : [],
        letterTrace: isResume ? null : await trace.letterSources(),
        letter: isResume ? null : await this.letterStatus(tx, version, latest),
      });
    }
    const pending = await repository.pendingProposal(document.id);
    const proposed =
      pending?.targetSnapshotId &&
      (await repository.findSnapshot(pending.targetSnapshotId));
    return {
      id: document.id,
      kind: document.kind,
      versions: views,
      generation: generation
        ? {
            id: generation.id,
            kind: generation.kind,
            status: generation.status,
            versionId: generation.versionId,
            sourceVersionId: generation.sourceVersionId,
            language: generation.language,
            reviewDepth: generation.reviewDepth,
            writingLevel: generation.writingLevel,
            tone: generation.tone,
            progress: await repository.generationProgress(generation.id),
            createdAt: generation.createdAt,
          }
        : null,
      proposal:
        pending?.versionId && pending.encryptedProposal && proposed
          ? {
              generationId: pending.id,
              versionId: pending.versionId,
              lines: proposalDiff(
                decryptDocument(cipher, proposed),
                decryptDocument(cipher, {
                  encryptedContent: pending.encryptedProposal,
                })
              ),
            }
          : null,
    };
  }

  /** The opening's keywords, each backed or not by fit check evidence. */
  private async keywordsWithEvidence(
    tx: DbClient,
    cipher: UserCipher,
    openingId: string
  ) {
    const openings = new OpeningsRepository(tx);
    const terms = (await openings.listTerms(openingId)).filter(
      (term) => term.kind === "keyword"
    );
    if (terms.length === 0) return null;
    const [fitCheck] = await openings.latestFitChecks([openingId]);
    const items = fitCheck ? await openings.listFitCheckItems(fitCheck.id) : [];
    return terms.map((term) => {
      const item = items.find((row) => row.termId === term.id);
      return {
        term: cipher.decrypt(term.encryptedText),
        backedByEvidence:
          !!item && item.verdict === "met" && item.evidenceIds.length > 0,
      };
    });
  }

  /**
   * Where lines come from, loaded once per view: each evidence item's quote,
   * position or credential and approval date, each instruction point's
   * text, and each credential's approval date.
   */
  private async traceSource(
    tx: DbClient,
    cipher: UserCipher,
    profileId: string,
    // Library documents have no application, so no instructions.
    openingId: string | null
  ) {
    const career = new CareerRepository(tx);
    const positions = await career.listPositions(profileId);
    const credentials = await career.listCredentials(profileId);
    const evidence = await new EvidenceRepository(tx).listEvidence(profileId);
    const equivalents = await new DocumentsRepository(tx).listTitleEquivalents(
      profileId
    );
    const originalTitles = new Map(
      positions.map((position) => [
        position.id,
        cipher.decrypt(position.encryptedTitle),
      ])
    );
    // Removed points keep their row, so old lines still trace to them.
    const instructions = new Map(
      (openingId
        ? await new InstructionsRepository(tx).listPoints(openingId)
        : []
      ).map((point) => [point.id, cipher.decrypt(point.encryptedText)])
    );
    const byId = new Map(
      evidence.map((row): [string, EvidenceTrace] => {
        const position = positions.find((p) => p.id === row.positionId);
        const credential = credentials.find((c) => c.id === row.credentialId);
        return [
          row.id,
          {
            evidenceId: row.id,
            text: cipher.decrypt(row.encryptedText),
            quote: cipher.decrypt(row.encryptedSourceQuote),
            source: position
              ? {
                  kind: "position",
                  title: cipher.decrypt(position.encryptedTitle),
                  employer: cipher.decrypt(position.encryptedEmployer),
                }
              : credential
                ? {
                    kind: "credential",
                    title: cipher.decrypt(credential.encryptedTitle),
                  }
                : null,
            approvedAt: row.approvedAt,
          },
        ];
      })
    );
    return {
      evidenceFor(content: DocumentContent) {
        const ids = new Set(
          documentLines(content).flatMap((line) =>
            "evidenceIds" in line.origin ? line.origin.evidenceIds : []
          )
        );
        return [...ids].flatMap((id) => byId.get(id) ?? []);
      },
      instructionsFor(content: DocumentContent) {
        const ids = new Set(
          documentLines(content).flatMap((line) =>
            line.origin.kind === "instruction" ? line.origin.instructionIds : []
          )
        );
        return [...ids].flatMap((id) => {
          const text = instructions.get(id);
          return text === undefined ? [] : [{ instructionId: id, text }];
        });
      },
      /** A letter's other sources: approved facts, points and goals. */
      async letterSources() {
        const facts = openingId
          ? await new ResearchRepository(tx).listFacts(openingId)
          : [];
        const interview = openingId
          ? await new MotivationRepository(tx).findInterviewByOpening(openingId)
          : null;
        const points = interview
          ? await new MotivationRepository(tx).listPoints(interview.id)
          : [];
        const goals = await new EvidenceRepository(tx).listCareerGoals(
          profileId
        );
        return {
          companyFacts: facts.map((fact) => ({
            id: fact.id,
            text: cipher.decrypt(fact.encryptedText),
            sourceUrl: cipher.decrypt(fact.encryptedSourceUrl),
          })),
          motivationPoints: points.map((point) => ({
            id: point.id,
            text: cipher.decrypt(point.encryptedText),
          })),
          careerGoals: goals.map((goal) => ({
            id: goal.id,
            text: cipher.decrypt(goal.encryptedText),
          })),
        };
      },
      titleProposalsFor(content: ResumeContent, language: OutputLanguage) {
        return content.sections.flatMap((section) =>
          section.kind === "experience"
            ? section.entries.flatMap((entry) => {
                const row = equivalents.find(
                  (candidate) =>
                    candidate.positionId === entry.positionId &&
                    candidate.language === language &&
                    !candidate.approvedAt
                );
                const proposed = row && cipher.decrypt(row.encryptedTitle);
                // Only over the position's own title, never an override.
                const printsOriginal =
                  originalTitles.get(entry.positionId) === entry.title;
                return proposed && printsOriginal && proposed !== entry.title
                  ? [
                      {
                        positionId: entry.positionId,
                        current: entry.title,
                        proposed,
                      },
                    ]
                  : [];
              })
            : []
        );
      },
      credentialApprovals: credentials.flatMap((row) =>
        row.approvedAt
          ? [{ credentialId: row.id, approvedAt: row.approvedAt }]
          : []
      ),
    };
  }

  /** A letter's resume state and whether it was written without motivation. */
  private async letterStatus(
    tx: DbClient,
    version: { dismissedResumeSnapshotId: string | null },
    latest: ResumeLink
  ) {
    const state = await letterResumeState(
      new DocumentsRepository(tx),
      latest,
      version
    );
    return {
      resumeVersionId: state.resumeVersionId,
      outdated: state.outdated,
      motivationSkipped: !!latest.motivationSkipped,
    };
  }

  /**
   * Saves the user's edit as a new snapshot. It must start from the
   * official snapshot, so two tabs never overwrite each other silently.
   */
  async saveEdit(input: {
    userId: string;
    versionId: string;
    baseSnapshotId: string;
    content: DocumentContent;
  }) {
    return this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const { version } = await requireUserVersion(
        tx,
        input.userId,
        input.versionId,
        { lock: true }
      );
      const latest = await repository.latestSnapshot(version.id);
      if (latest?.id !== input.baseSnapshotId) {
        throw new TRPCError({ code: "CONFLICT" });
      }
      const cipher = await getUserCipher(tx, input.userId);
      let content: DocumentContent;
      try {
        const previous = decryptDocument(cipher, latest);
        if (previous.kind !== input.content.kind) {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }
        content =
          previous.kind === "resume" && input.content.kind === "resume"
            ? applyUserEdit(previous, input.content)
            : applyLetterEdit(
                previous as CoverLetterContent,
                input.content as CoverLetterContent
              );
      } catch (error) {
        if (error instanceof LockedFactEditError) {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }
        throw error;
      }
      const snapshot = await repository.insertSnapshot({
        versionId: version.id,
        sequence: latest.sequence + 1,
        parentSnapshotId: latest.id,
        origin: "edited",
        author: "user",
        encryptedContent: cipher.encrypt(JSON.stringify(content)),
        ...resumeLinkOf(latest),
      });
      return { snapshotId: snapshot.id };
    });
  }

  /**
   * Deletes the latest snapshot, making the previous one official. The
   * first snapshot of a version can't be undone: deleting the version is
   * the way to drop it.
   */
  async undo(input: { userId: string; versionId: string }) {
    const { result, renderedKeys } = await this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const { version } = await requireUserVersion(
        tx,
        input.userId,
        input.versionId,
        { lock: true }
      );
      const { latest, previous } = await repository.topTwoSnapshots(version.id);
      if (!latest || !previous) {
        throw new TRPCError({ code: "PRECONDITION_FAILED" });
      }
      const renderedKeys = await repository.renderedKeysOfSnapshot(latest.id);
      await repository.deleteSnapshot(latest.id);
      return { result: { snapshotId: previous.id }, renderedKeys };
    });
    await this.deleteFiles(renderedKeys);
    return result;
  }

  /** Cached PDFs go with their snapshots, after the rows are gone. */
  private async deleteFiles(keys: string[]) {
    if (keys.length === 0) return;
    const storage = this.storage ?? getStorage();
    await Promise.all(keys.map((key) => storage.delete(key)));
  }

  /** The change history of a version, newest first. */
  async history(input: {
    userId: string;
    versionId: string;
  }): Promise<SnapshotSummary[]> {
    const repository = new DocumentsRepository(this.db);
    const { version } = await requireUserVersion(
      this.db,
      input.userId,
      input.versionId
    );
    return (await repository.listSnapshots(version.id)).map(summary);
  }

  /** One snapshot's content, to show or compare an old change. */
  async snapshot(input: { userId: string; snapshotId: string }) {
    const repository = new DocumentsRepository(this.db);
    const snapshot = await repository.findSnapshot(input.snapshotId);
    if (!snapshot) throw notFound();
    await requireUserVersion(this.db, input.userId, snapshot.versionId);
    const cipher = await getUserCipher(this.db, input.userId);
    return {
      ...summary(snapshot),
      content: decryptDocument(cipher, snapshot),
    };
  }

  /** Restoring an old change creates a new latest snapshot with it. */
  async restore(input: { userId: string; snapshotId: string }) {
    return this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const old = await repository.findSnapshot(input.snapshotId);
      if (!old) throw notFound();
      const { version } = await requireUserVersion(
        tx,
        input.userId,
        old.versionId,
        { lock: true }
      );
      const latest = await repository.latestSnapshot(version.id);
      const snapshot = await repository.insertSnapshot({
        versionId: version.id,
        sequence: latest.sequence + 1,
        parentSnapshotId: latest.id,
        origin: "restored",
        author: "user",
        encryptedContent: old.encryptedContent,
        // The restored text's own resume, not the newer one's.
        ...resumeLinkOf(old),
      });
      return { snapshotId: snapshot.id };
    });
  }

  /**
   * A new, independent version from the official snapshot of this one, in
   * the same language (not linked for language sync).
   */
  async duplicate(input: { userId: string; versionId: string }) {
    return this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const { version } = await requireUserVersion(
        tx,
        input.userId,
        input.versionId
      );
      const latest = await repository.latestSnapshot(version.id);
      if (!latest) throw notFound();
      const cipher = await getUserCipher(tx, input.userId);
      const copy = await repository.insertVersion({
        documentId: version.documentId,
        language: version.language,
        encryptedLabel: cipher.encrypt(
          version.language === "pt-BR" ? "cópia" : "copy"
        ),
      });
      await repository.insertSnapshot({
        versionId: copy.id,
        sequence: 1,
        parentSnapshotId: latest.id,
        origin: "copied",
        author: "user",
        encryptedContent: latest.encryptedContent,
        ...resumeLinkOf(latest),
      });
      return { versionId: copy.id };
    });
  }

  async renameVersion(input: {
    userId: string;
    versionId: string;
    label: string;
  }) {
    return this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const { version } = await requireUserVersion(
        tx,
        input.userId,
        input.versionId
      );
      const cipher = await getUserCipher(tx, input.userId);
      const label = input.label.trim();
      await repository.updateVersion(version.id, {
        encryptedLabel: label ? cipher.encrypt(label) : null,
      });
    });
  }

  /** Deletes a version and all its snapshots; final, so the UI confirms. */
  async deleteVersion(input: { userId: string; versionId: string }) {
    const renderedKeys = await this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const { version } = await requireUserVersion(
        tx,
        input.userId,
        input.versionId
      );
      const keys = await repository.renderedKeysOfVersion(version.id);
      await repository.deleteVersion(version.id);
      return keys;
    });
    await this.deleteFiles(renderedKeys);
  }
}

function summary(snapshot: {
  id: string;
  sequence: number;
  origin: SnapshotSummary["origin"];
  author: SnapshotSummary["author"];
  createdAt: Date;
}): SnapshotSummary {
  return {
    id: snapshot.id,
    sequence: snapshot.sequence,
    origin: snapshot.origin,
    author: snapshot.author,
    createdAt: snapshot.createdAt,
  };
}

/** A generation whose task never started: it failed, nothing waits on it. */
export const failGeneration = (db: DbClient, generationId: string) =>
  new DocumentsRepository(db).updateGeneration(generationId, {
    status: "failed",
    finishedAt: new Date(),
  });
