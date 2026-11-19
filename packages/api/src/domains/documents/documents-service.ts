import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { AgentChatRepository } from "@repo/api/domains/agents/agent-chat-repository";
import { InstructionsRepository } from "@repo/api/domains/applications/instructions-repository";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import {
  getUserCipher,
  type UserCipher,
} from "@repo/api/domains/encryption/user-cipher";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
import { ProfileRepository } from "@repo/api/domains/profile/profile-repository";
import { readSuggestionContent } from "@repo/api/domains/profile/suggestions/propose-suggestion";
import {
  suggestLine,
  type SuggestionTarget,
} from "@repo/api/domains/profile/suggestions/suggest-line";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";
import { getStorage, type Storage } from "@repo/api/tools/storage/storage";
import { triggerClient } from "@repo/api/tools/trigger/trigger-client";
import { MotivationRepository } from "@repo/api/domains/applications/motivation/motivation-repository";
import { ResearchRepository } from "@repo/api/domains/applications/research/research-repository";
import type { AiClient } from "@repo/api/domains/ai/ai-client";
import { smallCallAi } from "@repo/api/domains/ai/small-call-ai";

import { DocumentsRepository } from "./documents-repository";
import { outdatedVersions } from "./adaptation/sync-status";
import {
  type CoverageReviewContent,
  coverageReviewContentSchema,
  bestFactFor,
  ownWordsFacts,
} from "./coverage-review/coverage-review";
import { tracesToProfile } from "./coverage-review/check-document";
import { matchProfileLines } from "./coverage-review/match-profile-lines";
import { attachTraces, retraceContent } from "./coverage-review/retrace-lines";
import { reprintFields } from "./translation/reprint-fields";
import { sendLineToProfile } from "./coverage-review/send-to-profile";
import {
  FrozenContexts,
  snapshotCoverage,
} from "./coverage-review/snapshot-coverage";
import type { CareerContext } from "./generation/load-career-context";
import {
  writtenLines,
  estimatePages,
  resumeText,
} from "./generation/resume-checks";
import { outputLanguageNames } from "./generation/resume-prompts";
import { decryptDocument } from "./snapshot-content";
import { proposalDiff } from "./adaptation/three-way-merge";
import { fileNamer } from "./rendering/file-namer";
import { pdfTemplate } from "./rendering/pdf-template";
import { requireUserVersion } from "./require-version";
import { applyLinkedinEdit } from "./linkedin/apply-linkedin-edit";
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
import { freezeGeneration } from "./generation/generation-request";
import { reviewViewOf } from "./generation/review-view";
import { loadProfileSource } from "./generation/load-profile-source";
import {
  defaultGenerationSettings,
  type GenerationSettings,
} from "./schemas/generation-settings";
import type {
  OutputLanguage,
  ReviewDepth,
  WritingLevel,
} from "./schemas/document";
import type {
  CoverageReviewView,
  CoverageView,
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

// Ignored findings a version remembers; the oldest keys fall off.
const maxDismissedFindings = 200;

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
    private readonly storage?: Storage,
    // The AI client for the small calls made outside a task.
    private readonly aiFor: (
      userId: string,
      cipher: UserCipher
    ) => Promise<AiClient> = (userId, cipher) => smallCallAi(db, userId, cipher)
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
    /**
     * "Adjust" (the method's prompt 04b): a version of the same family to
     * start from, changing only what this opening needs.
     */
    referenceVersionId?: string;
    /** What the user changed in the settings form, for this document. */
    settings?: Partial<GenerationSettings>;
  }): Promise<{ generationId: string; realtime: RealtimeSubscription }> {
    const profile = await this.requireProfile(input.userId);
    const frozen = await freezeGeneration({
      db: this.db,
      cipher: await getUserCipher(this.db, input.userId),
      userId: input.userId,
      profileId: profile.id,
      settings: input.settings,
    });
    // What it may cost depends on career length, depth and level.
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
      const version = input.versionId
        ? await repository.findVersion(input.versionId)
        : null;
      if (input.versionId && version?.documentId !== document.id) {
        throw notFound();
      }
      const referenced = input.referenceVersionId
        ? await requireUserVersion(tx, input.userId, input.referenceVersionId)
        : null;
      if (referenced && referenced.document.kind !== "resume") {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      const reference =
        referenced && (await repository.latestSnapshot(referenced.version.id));
      // An adjustment keeps the reference's bullets as written, so it is in
      // the reference's language (adapting comes after, like any version);
      // generating again into a version stays in that version's language.
      const language =
        referenced?.version.language ?? version?.language ?? input.language;
      // Into an existing version, only a reference written in its language.
      if (version && version.language !== language) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      return repository.insertGeneration({
        profileId: profile.id,
        documentId: document.id,
        versionId: input.versionId ?? null,
        referenceSnapshotId: reference?.id ?? null,
        profileVersionId: frozen.profileVersionId,
        settings: frozen.settings,
        language,
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

  /**
   * The opening's cover letter document, created empty when there is none:
   * the letter's agent is keyed by the document, so it can help during the
   * preparation and the same conversation goes on beside the letter.
   */
  async letterAgentDocument(input: { userId: string; openingId: string }) {
    const profile = await this.requireProfile(input.userId);
    return this.db.transaction(async (tx) => {
      const opening = await new OpeningsRepository(tx).findOpening({
        profileId: profile.id,
        openingId: input.openingId,
      });
      if (!opening) throw notFound();
      const repository = new DocumentsRepository(tx);
      const application = await repository.findOrInsertApplication({
        profileId: profile.id,
        openingId: opening.id,
      });
      const document = await repository.findOrInsertApplicationDocument({
        profileId: profile.id,
        applicationId: application.id,
        kind: "cover_letter",
      });
      return { documentId: document.id };
    });
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
            this.documentView(
              tx,
              cipher,
              document,
              keywords,
              trace,
              input.userId
            )
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
      return this.documentView(tx, cipher, document, null, trace, input.userId);
    });
  }

  private async documentView(
    tx: DbClient,
    cipher: UserCipher,
    document: Parameters<typeof fileNamer>[2] & {
      id: string;
      profileId: string;
    },
    keywords: Array<{ term: string; backedByEvidence: boolean }> | null,
    trace: TraceSource,
    userId: string
  ): Promise<DocumentView> {
    const nameFor = await fileNamer(tx, cipher, document);
    const repository = new DocumentsRepository(tx);
    const published = await this.publishedProfileVersion(tx, userId);
    const sentSuggestions = await this.documentSuggestions(tx, cipher, userId);
    const versions = await repository.listVersions([document.id]);
    const generation = await repository.latestGeneration(document.id);
    const outdated = await outdatedVersions(repository, cipher, versions);
    // The settings the document was written with, for a version no
    // generation wrote itself (an adaptation, a copy).
    const documentSettings = await repository.writtenSettings(document.id);
    const sent = await repository.submissionsForVersions(
      versions.map((version) => version.id)
    );
    // Each snapshot's text is read against the profile version it froze.
    const contexts = new FrozenContexts(tx, cipher, document.profileId);
    const openingId = await contexts.openingOf(document.applicationId);
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
      const isLetter = content.kind === "cover_letter";
      const written = await repository.latestWrittenGeneration(version.id);
      const coverage = await snapshotCoverage({
        db: tx,
        cipher,
        contexts,
        document,
        version,
        snapshot: latest,
        written,
        rendered,
      });
      const frozen =
        coverage?.context ??
        (await contexts.load({
          profileVersionId: latest.profileVersionId,
          openingId,
          language: version.language,
        }));
      views.push({
        id: version.id,
        language: version.language,
        label: version.encryptedLabel
          ? cipher.decrypt(version.encryptedLabel)
          : null,
        snapshot: summary(latest),
        snapshotCount: await repository.countSnapshots(version.id),
        sent: sent.find((row) => row.versionId === version.id) ?? null,
        content,
        // The rendered PDF's real length once it exists; an estimate before.
        pages:
          rendered?.pages ??
          (isResume
            ? estimatePages(content)
            : isLetter
              ? estimateLetterPages(content)
              : 1),
        // The page limit this version was written under.
        maxPages: isLetter
          ? ((written?.settings ?? documentSettings)?.letterMaxPages ??
            defaultGenerationSettings.letterMaxPages)
          : ((written?.settings ?? documentSettings)?.resumeMaxPages ??
            defaultGenerationSettings.resumeMaxPages),
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
        emphasis: written?.encryptedEmphasis
          ? {
              lines: z
                .array(z.string())
                .parse(JSON.parse(cipher.decrypt(written.encryptedEmphasis))),
              adjusted: !!written.referenceSnapshotId,
            }
          : null,
        review:
          isResume && written
            ? reviewViewOf(
                await repository.listReviewRounds(written.id),
                cipher,
                openingId ? "opening" : "focus",
                {
                  latestId: latest.id,
                  generationSnapshotId: written.snapshotId,
                }
              )
            : null,
        reviewing: isResume ? await this.reviewing(tx, latest.id) : null,
        trace: evidenceTrace(content, frozen),
        instructionTrace: trace.instructionsFor(content),
        coverage: await this.coverageView(repository, cipher, version, latest, {
          findings: coverage.findings,
          context: frozen,
        }),
        dismissedFindings: version.dismissedFindings,
        profile: {
          versionNumber: frozen.profileVersionNumber,
          // A snapshot from before they carried a version reads the one
          // published now: "Use version N" pins it.
          newer:
            published &&
            published.id !== latest.profileVersionId &&
            (!latest.profileVersionId ||
              published.number > (frozen.profileVersionNumber ?? 0))
              ? { profileVersionId: published.id, number: published.number }
              : null,
        },
        sentToProfile: sentToProfile(
          coverage.findings,
          writtenLines(content),
          sentSuggestions
        ),
        sentTranslations: sentTranslations(coverage.findings, sentSuggestions),
        outdated: outdated.get(version.id) ?? [],
        titleProposals: isResume
          ? trace.titleProposalsFor(content, version.language)
          : [],
        letterTrace: isLetter ? await trace.letterSources() : null,
        letter: isLetter ? await this.letterStatus(tx, version, latest) : null,
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
            adjusted:
              generation.kind === "generate" &&
              !!generation.referenceSnapshotId,
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

  /** The profile version published now, if any. */
  private async publishedProfileVersion(tx: DbClient, userId: string) {
    const profiles = new ProfileRepository(tx);
    const document = await profiles.findDocument(userId, "profile");
    if (!document?.publishedVersionId) return null;
    const version = await profiles.findVersion(
      document.id,
      document.publishedVersionId
    );
    return version ? { id: version.id, number: version.number } : null;
  }

  /** The suggestions documents sent to the profile, waiting or accepted. */
  private async documentSuggestions(
    tx: DbClient,
    cipher: UserCipher,
    userId: string
  ): Promise<SentSuggestion[]> {
    const profiles = new ProfileRepository(tx);
    const document = await profiles.findDocument(userId, "profile");
    if (!document) return [];
    const rows = await profiles.listSuggestionsByOrigin(
      document.id,
      "document"
    );
    return rows.flatMap((row) =>
      row.status === "pending" || row.status === "accepted"
        ? [
            {
              id: row.id,
              status: row.status,
              lines: readSuggestionContent(cipher, row)
                .replace.split("\n")
                .map((line) => line.trim()),
            },
          ]
        : []
    );
  }

  /**
   * "Add to the profile" (resume spec, "Document workspace"): a line of the
   * official snapshot that doesn't trace to the frozen profile version
   * becomes a suggestion in the profile's draft (origin `document`), in
   * the part it belongs to: an experience line under its position's
   * Results, a skills line under Competencies, a summary or a letter
   * paragraph under the career direction. The user accepts it there.
   */
  async addLineToProfile(input: {
    userId: string;
    versionId: string;
    lineId: string;
  }) {
    const { version, document, profile } = await requireUserVersion(
      this.db,
      input.userId,
      input.versionId
    );
    const repository = new DocumentsRepository(this.db);
    const latest = await repository.latestSnapshot(version.id);
    if (!latest) throw notFound();
    const cipher = await getUserCipher(this.db, input.userId);
    const content = decryptDocument(cipher, latest);
    const line = writtenLines(content).find((row) => row.id === input.lineId);
    if (!line?.origin || !line.text.trim()) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }
    const contexts = new FrozenContexts(this.db, cipher, profile.id);
    const context = await contexts.load({
      profileVersionId: latest.profileVersionId,
      openingId: await contexts.openingOf(document.applicationId),
      language: version.language,
    });
    if (tracesToProfile(line.origin, context)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This line is in your profile already.",
      });
    }
    const group =
      content.kind === "resume"
        ? content.sections
            .flatMap((section) =>
              section.kind === "skills" ? section.groups : []
            )
            .find((candidate) => candidate.id === line.id)
        : undefined;
    const target: SuggestionTarget = line.positionId
      ? { kind: "experience", positionId: line.positionId, field: "results" }
      : group
        ? { kind: "section", section: "competencies" }
        : { kind: "careerDirection" };
    const kind = {
      resume: { "en-US": "resume", "pt-BR": "currículo" },
      cover_letter: {
        "en-US": "cover letter",
        "pt-BR": "carta de apresentação",
      },
      linkedin: { "en-US": "LinkedIn text", "pt-BR": "texto do LinkedIn" },
    }[content.kind];
    return suggestLine({
      db: this.db,
      cipher,
      userId: input.userId,
      careerProfileId: profile.id,
      target,
      // A position the draft no longer has: the fact still has a place.
      fallback: { kind: "careerDirection" },
      text: group ? `${group.label}: ${line.text}` : line.text,
      reason: {
        "en-US": `Written in your ${kind["en-US"]} and not in your profile yet.`,
        "pt-BR": `Escrito no seu ${kind["pt-BR"]} e ainda fora do seu perfil.`,
      },
      origin: "document",
    });
  }

  /**
   * "Add translation" of a "not translated" finding (resume spec, "Document
   * workspace"): the field as the profile writes it, with the wording the
   * user gave for the document's language, becomes a suggestion adding the
   * entry to the profile's translations dictionary for that language
   * (origin `document`). It applies once published and used here.
   */
  async addTranslationToProfile(input: {
    userId: string;
    versionId: string;
    original: string;
    translation: string;
  }) {
    const { version, profile } = await requireUserVersion(
      this.db,
      input.userId,
      input.versionId
    );
    const original = input.original.trim().replace(/\s+/g, " ");
    const translation = input.translation.trim().replace(/\s+/g, " ");
    if (!original || !translation || /[;→]/.test(`${original}${translation}`)) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }
    const cipher = await getUserCipher(this.db, input.userId);
    return suggestLine({
      db: this.db,
      cipher,
      userId: input.userId,
      careerProfileId: profile.id,
      target: { kind: "translation", language: version.language },
      text: `${original} → ${translation}`,
      reason: {
        "en-US": `How your documents in ${outputLanguageNames[version.language]} write “${original}”.`,
        "pt-BR": `Como os seus documentos em ${languageNamesPt[version.language]} escrevem “${original}”.`,
      },
      origin: "document",
    });
  }

  /**
   * "Use version N" (resume spec, "Document workspace"): the version moves
   * to the profile version published now. A new snapshot with the same
   * text freezes it, its lines traced again against it (a line that
   * version backs by its words gets its trace), and the checks read it
   * from then on. No model is called.
   */
  async useProfileVersion(input: { userId: string; versionId: string }) {
    return this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const { version, document, profile } = await requireUserVersion(
        tx,
        input.userId,
        input.versionId,
        { lock: true }
      );
      const latest = await repository.latestSnapshot(version.id);
      if (!latest) throw notFound();
      const published = await this.publishedProfileVersion(tx, input.userId);
      if (!published || published.id === latest.profileVersionId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The document reads the published profile version already.",
        });
      }
      const cipher = await getUserCipher(tx, input.userId);
      const { content } = await this.rebasedContent({
        db: tx,
        cipher,
        profileId: profile.id,
        document,
        version,
        latest,
        published,
      });
      const snapshot = await repository.insertSnapshot({
        versionId: version.id,
        sequence: latest.sequence + 1,
        parentSnapshotId: latest.id,
        origin: "rebased",
        author: "user",
        encryptedContent: cipher.encrypt(JSON.stringify(content)),
        profileVersionId: published.id,
        ...resumeLinkOf(latest),
      });
      return {
        snapshotId: snapshot.id,
        profileVersionNumber: published.number,
      };
    });
  }

  /**
   * The latest snapshot's content traced again against the published
   * profile version (the traces of "Use version N"), with the contexts it
   * was read from. No model is called.
   */
  private async rebasedContent(input: {
    db: DbClient;
    cipher: UserCipher;
    profileId: string;
    document: { applicationId: string | null };
    version: { language: OutputLanguage };
    latest: NonNullable<
      Awaited<ReturnType<DocumentsRepository["latestSnapshot"]>>
    >;
    published: { id: string };
  }) {
    const { cipher, latest, version } = input;
    const contexts = new FrozenContexts(input.db, cipher, input.profileId);
    const openingId = await contexts.openingOf(input.document.applicationId);
    // `untranslated`: the version as the profile wrote it, in its own
    // language (no dictionaries applied).
    const load = (profileVersionId: string | null, untranslated = false) =>
      contexts.load({
        profileVersionId,
        openingId,
        language: untranslated ? undefined : version.language,
      });
    const from = await load(latest.profileVersionId);
    // The same version untranslated: a field a document printed before
    // translations existed still reads as the profile wrote it.
    const fromSource = await load(latest.profileVersionId, true);
    const to = await load(input.published.id);
    const retraced = retraceContent(decryptDocument(cipher, latest), {
      from,
      to,
    });
    // A translations dictionary entry published since applies to the
    // fields code printed and the user left as printed.
    const content =
      retraced.kind === "resume"
        ? reprintFields(retraced, to, from, fromSource)
        : retraced;
    return { content, to };
  }

  /**
   * "Check against my profile" (resume spec, "Document workspace"): the
   * lines the profile didn't back (the user's own, or edited by hand) are
   * checked by a small model call against the profile published now, not
   * only the version the document froze. The document moves to that
   * version as "Use version N" does (the traces of the other lines are
   * found again by code); a line the model shows the profile backs gets
   * its trace and stops being pointed out, in a new snapshot that records
   * the version used. The others stay, with what the profile doesn't say.
   * One call for all the lines, spending no credit (the user's own key on
   * a paid plan, else StoryToRole pays), like rewriting a gap answer.
   */
  async checkAgainstProfile(input: {
    userId: string;
    versionId: string;
    // Only these lines; every unbacked line by default.
    lineIds?: string[];
  }) {
    const { version, document, profile } = await requireUserVersion(
      this.db,
      input.userId,
      input.versionId
    );
    const repository = new DocumentsRepository(this.db);
    const latest = await repository.latestSnapshot(version.id);
    if (!latest) throw notFound();
    const published = await this.publishedProfileVersion(this.db, input.userId);
    if (!published) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "There is no published profile to check against.",
      });
    }
    const cipher = await getUserCipher(this.db, input.userId);
    const { content, to } = await this.rebasedContent({
      db: this.db,
      cipher,
      profileId: profile.id,
      document,
      version,
      latest,
      published,
    });
    const wanted = input.lineIds ? new Set(input.lineIds) : null;
    const lines = documentLines(content)
      .filter(
        (line) =>
          line.text.trim() &&
          !tracesToProfile(line.origin, to) &&
          (!wanted || wanted.has(line.id))
      )
      .map((line) => ({ id: line.id, text: line.text }));
    const matches = await matchProfileLines({
      ai: await this.aiFor(input.userId, cipher),
      lines,
      context: to,
    });
    const traces = new Map(
      [...matches].flatMap(([lineId, match]) =>
        match.evidenceIds.length ? [[lineId, match.evidenceIds] as const] : []
      )
    );
    const traced = attachTraces(content, traces);
    const moved = published.id !== latest.profileVersionId;
    let snapshotId: string | null = null;
    if (moved || traces.size > 0) {
      snapshotId = await this.db.transaction(async (tx) => {
        const locked = new DocumentsRepository(tx);
        await requireUserVersion(tx, input.userId, input.versionId, {
          lock: true,
        });
        const current = await locked.latestSnapshot(version.id);
        if (current?.id !== latest.id) {
          throw new TRPCError({ code: "CONFLICT" });
        }
        const snapshot = await locked.insertSnapshot({
          versionId: version.id,
          sequence: latest.sequence + 1,
          parentSnapshotId: latest.id,
          origin: "rebased",
          author: "user",
          encryptedContent: cipher.encrypt(JSON.stringify(traced)),
          profileVersionId: published.id,
          ...resumeLinkOf(latest),
        });
        return snapshot.id;
      });
    }
    return {
      snapshotId,
      profileVersionNumber: published.number,
      lines: lines.map((line) => {
        const match = matches.get(line.id)!;
        return {
          lineId: line.id,
          backed: match.evidenceIds.length > 0,
          missing: match.missing,
          figures: match.figures,
        };
      }),
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
   * Where lines come from, loaded once per view: each instruction point's
   * text and each credential's approval date.
   */
  private async traceSource(
    tx: DbClient,
    cipher: UserCipher,
    profileId: string,
    // Library documents have no application, so no instructions.
    openingId: string | null
  ) {
    // Titles as the published profile writes them: a proposed equivalent
    // only ever replaces one of those.
    const positions =
      (await loadProfileSource({ db: tx, cipher, profileId }))?.positions ?? [];
    const equivalents = await new DocumentsRepository(tx).listTitleEquivalents(
      profileId
    );
    const originalTitles = new Map(
      positions.map((position) => [position.id, position.title])
    );
    // Removed points keep their row, so old lines still trace to them.
    const instructions = new Map(
      (openingId
        ? await new InstructionsRepository(tx).listPoints(openingId)
        : []
      ).map((point) => [point.id, cipher.decrypt(point.encryptedText)])
    );
    return {
      instructionsFor(content: DocumentContent) {
        const ids = new Set(
          documentLines(content).flatMap((line) =>
            line.origin.kind === "instruction" || line.origin.kind === "letter"
              ? line.origin.instructionIds
              : []
          )
        );
        return [...ids].flatMap((id) => {
          const text = instructions.get(id);
          return text === undefined ? [] : [{ instructionId: id, text }];
        });
      },
      /** A letter's other sources: approved facts and motivation points. */
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
    };
  }

  /** The re-review of a snapshot under way, with what it last reported. */
  private async reviewing(tx: DbClient, snapshotId: string) {
    const tasks = new TasksRepository(tx);
    return (await tasks.activeTask(snapshotId, "review_document"))
      ? { progress: await tasks.latestProgress(snapshotId, "review_document") }
      : null;
  }

  /**
   * A resume version's coverage (resume spec, "Coverage review"): the code
   * checks on the official snapshot and the latest AI review, its ids
   * resolved into the texts of the snapshot it reviewed and of the frozen
   * profile.
   */
  private async coverageView(
    repository: DocumentsRepository,
    cipher: UserCipher,
    version: { id: string },
    latest: { id: string },
    input: { findings: CoverageView["findings"]; context: CareerContext }
  ): Promise<CoverageView> {
    const stored = await repository.latestCoverageReview(version.id);
    if (!stored) {
      return {
        findings: input.findings,
        review: null,
        reviewedSnapshotId: null,
        current: false,
      };
    }
    const review = coverageReviewContentSchema.parse(
      JSON.parse(cipher.decrypt(stored.review.encryptedContent))
    );
    const reviewed = decryptDocument(cipher, stored.snapshot);
    const lines = new Map(
      writtenLines(reviewed).map((line) => [line.id, line.text])
    );
    const evidence = new Map(
      evidenceTrace(reviewed, input.context, {
        all: true,
      }).map((row) => [row.evidenceId, row])
    );
    const resolved: CoverageReviewView = {
      id: stored.review.id,
      createdAt: stored.review.createdAt,
      sources: review.sources,
      preserved: review.preserved,
      strong: review.strong.flatMap((item) => {
        const lineText = lines.get(item.lineId);
        const proof = evidence.get(item.evidenceId);
        return lineText !== undefined && proof
          ? [{ ...item, lineText, evidence: proof }]
          : [];
      }),
      partial: review.partial,
      gaps: review.gaps,
      inconsistencies: review.inconsistencies.flatMap((item) => {
        const lineText = lines.get(item.lineId);
        return lineText !== undefined ? [{ ...item, lineText }] : [];
      }),
      suggestions: review.suggestions.map((item) => ({
        ...item,
        lineText: item.lineId ? (lines.get(item.lineId) ?? null) : null,
      })),
      statement: review.statement,
    };
    return {
      findings: input.findings,
      review: resolved,
      reviewedSnapshotId: stored.snapshot.id,
      current: stored.snapshot.id === latest.id,
    };
  }

  /**
   * "Send to my profile" (resume spec, "Coverage review"): a `profile`
   * suggestion of a review, about a line resting on the user's own words,
   * becomes a suggestion in the profile's draft, under that line's
   * experience; nothing changes until the user accepts it there.
   */
  async sendToProfile(input: {
    userId: string;
    coverageReviewId: string;
    lineId: string;
  }) {
    const profile = await this.requireProfile(input.userId);
    const found = await new DocumentsRepository(this.db).findCoverageReview(
      input.coverageReviewId
    );
    if (found?.document.profileId !== profile.id) throw notFound();
    const cipher = await getUserCipher(this.db, input.userId);
    const review: CoverageReviewContent = coverageReviewContentSchema.parse(
      JSON.parse(cipher.decrypt(found.review.encryptedContent))
    );
    const suggestion = review.suggestions.find(
      (item) => item.kind === "profile" && item.lineId === input.lineId
    );
    const line = writtenLines(decryptDocument(cipher, found.snapshot)).find(
      (candidate) => candidate.id === input.lineId
    );
    if (!suggestion || !line) throw new TRPCError({ code: "BAD_REQUEST" });
    // The fact is the line's (a resume bullet) or the instruction's (what a
    // letter paragraph rests on), under the position it is about.
    const context = await new FrozenContexts(this.db, cipher, profile.id).load({
      profileVersionId: found.snapshot.profileVersionId,
      openingId: found.document.applicationId
        ? ((
            await new DocumentsRepository(this.db).findApplication(
              found.document.applicationId
            )
          )?.openingId ?? null)
        : null,
      language: found.version.language,
    });
    const facts = ownWordsFacts(line, context.instructions);
    if (facts.length === 0) throw new TRPCError({ code: "BAD_REQUEST" });
    // A paragraph may rest on several instructions: the one the review's
    // suggestion speaks of (most words in common), else the first.
    const fact = bestFactFor(facts, suggestion.text);
    return sendLineToProfile({
      db: this.db,
      cipher,
      userId: input.userId,
      careerProfileId: profile.id,
      positionId: fact.positionId,
      text: fact.text,
      reason: suggestion.text,
    });
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
            : previous.kind === "linkedin" && input.content.kind === "linkedin"
              ? applyLinkedinEdit(previous, input.content)
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
   * Ignores (or brings back) a finding of the version by its key (resume
   * spec, "Document workspace"): a warning or a review note, stored as a
   * hash the editor computes again from the finding's own words.
   */
  async setFindingDismissed(input: {
    userId: string;
    versionId: string;
    findingKey: string;
    dismissed: boolean;
  }) {
    return this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const { version } = await requireUserVersion(
        tx,
        input.userId,
        input.versionId,
        { lock: true }
      );
      const others = version.dismissedFindings.filter(
        (key) => key !== input.findingKey
      );
      const dismissedFindings = input.dismissed
        ? [...others, input.findingKey].slice(-maxDismissedFindings)
        : others;
      await repository.updateVersion(version.id, { dismissedFindings });
      return { dismissedFindings };
    });
  }

  /**
   * "Review again" (resume spec, "Review rounds"): one reviewer and the
   * coverage review judge the resume's latest snapshot as it is, in a
   * task, rewriting nothing. Only for a resume the profile wrote, whose
   * latest snapshot no review judged yet.
   */
  async reviewAgain(input: { userId: string; versionId: string }) {
    const { version, document } = await requireUserVersion(
      this.db,
      input.userId,
      input.versionId
    );
    const repository = new DocumentsRepository(this.db);
    const latest = await repository.latestSnapshot(version.id);
    const written = await repository.latestWrittenGeneration(version.id);
    if (document.kind !== "resume" || !latest || !written) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }
    const cipher = await getUserCipher(this.db, input.userId);
    const review = reviewViewOf(
      await repository.listReviewRounds(written.id),
      cipher,
      "opening",
      { latestId: latest.id, generationSnapshotId: written.snapshotId }
    );
    if (review?.current) throw new TRPCError({ code: "PRECONDITION_FAILED" });
    const active = await new TasksRepository(this.db).activeTask(
      latest.id,
      "review_document"
    );
    if (active) throw new TRPCError({ code: "CONFLICT" });
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "review_document",
    });
    const { realtime } = await this.tasks.start({
      userId: input.userId,
      type: "review_document",
      subjectId: latest.id,
    });
    return { snapshotId: latest.id, realtime };
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
    const sent = await repository.submissionsForVersions([version.id]);
    return (await repository.listSnapshots(version.id)).map((snapshot) =>
      summary(
        snapshot,
        sent.find((row) => row.snapshotId === snapshot.id)?.sentAt ?? null
      )
    );
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
        // The restored text's own profile version and resume, not the
        // newer one's.
        profileVersionId: old.profileVersionId,
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

  /**
   * Deletes a whole document of the user's: its versions, snapshots, change
   * history, generations, conversations and cached PDFs. Final, so the UI
   * confirms. An application stays; the tracker shows "sent version deleted"
   * where a sent snapshot went. The agent's runs and sessions end on
   * Trigger.dev afterwards, best effort.
   */
  async deleteDocument(input: { userId: string; documentId: string }) {
    const { renderedKeys, chatIds } = await this.db.transaction(async (tx) => {
      const profile = await this.requireProfile(input.userId, tx);
      const repository = new DocumentsRepository(tx);
      const document = await repository.findDocument(input.documentId);
      if (document?.profileId !== profile.id) throw notFound();
      const keys = await repository.renderedKeysOfDocument(document.id);
      const chats = await new AgentChatRepository(tx).listChatIdsOfDocument(
        document.id
      );
      await repository.deleteDocument(document.id);
      return { renderedKeys: keys, chatIds: chats };
    });
    await this.deleteFiles(renderedKeys);
    await Promise.all(
      chatIds.map(async (chatId) => {
        await triggerClient.cancelChatRuns(chatId).catch(() => undefined);
        await triggerClient
          .closeSession(chatId, "document deleted")
          .catch(() => undefined);
      })
    );
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

function summary(
  snapshot: {
    id: string;
    sequence: number;
    origin: SnapshotSummary["origin"];
    author: SnapshotSummary["author"];
    createdAt: Date;
  },
  sentAt: Date | null = null
): SnapshotSummary {
  return {
    sentAt,
    id: snapshot.id,
    sequence: snapshot.sequence,
    origin: snapshot.origin,
    author: snapshot.author,
    createdAt: snapshot.createdAt,
  };
}

/**
 * The profile lines a document's lines cite, read from the version the
 * snapshot froze (resume spec, "Trace in the editor"); with `all`, every
 * line of that version, for a review's proofs.
 */
function evidenceTrace(
  content: DocumentContent,
  context: CareerContext,
  { all = false } = {}
): EvidenceTrace[] {
  const cited = new Set(
    documentLines(content).flatMap((line) =>
      "evidenceIds" in line.origin ? line.origin.evidenceIds : []
    )
  );
  return context.evidence
    .filter((row) => all || cited.has(row.id))
    .map((row) => {
      const position = context.positions.find(
        (candidate) => candidate.id === row.positionId
      );
      return {
        evidenceId: row.id,
        text: row.text,
        source: position
          ? {
              kind: "position",
              title: position.title,
              employer: position.employer,
            }
          : null,
      };
    });
}

type SentSuggestion = {
  id: string;
  status: "pending" | "accepted";
  // The lines the suggestion writes, trimmed.
  lines: string[];
};

/**
 * Which "not in your profile" lines were added to the profile: the latest
 * suggestion whose written lines hold the line's words, waiting in the
 * draft or accepted there.
 */
function sentToProfile(
  findings: CoverageView["findings"],
  lines: Array<{ id: string; text: string }>,
  suggestions: SentSuggestion[]
): VersionView["sentToProfile"] {
  const textOf = new Map(lines.map((line) => [line.id, line.text.trim()]));
  return findings.flatMap((finding) => {
    if (finding.code !== "notInProfile" || !finding.lineId) return [];
    const text = textOf.get(finding.lineId);
    if (!text) return [];
    const sent = suggestions.findLast((suggestion) =>
      suggestion.lines.some((line) => line.includes(text))
    );
    return sent
      ? [
          {
            lineId: finding.lineId,
            profileSuggestionId: sent.id,
            status: sent.status,
          },
        ]
      : [];
  });
}

/**
 * Which "not translated" fields were sent to the profile's dictionary: the
 * latest suggestion whose lines hold the field as an entry's original.
 */
function sentTranslations(
  findings: CoverageView["findings"],
  suggestions: SentSuggestion[]
): VersionView["sentTranslations"] {
  return findings.flatMap((finding) => {
    if (finding.code !== "untranslated") return [];
    const prefix = `${finding.text} →`;
    const sent = suggestions.findLast((suggestion) =>
      suggestion.lines.some((line) => line.includes(prefix))
    );
    return sent
      ? [
          {
            original: finding.text,
            profileSuggestionId: sent.id,
            status: sent.status,
          },
        ]
      : [];
  });
}

const languageNamesPt: Record<OutputLanguage, string> = {
  "en-US": "inglês",
  "pt-BR": "português",
};

/** A generation whose task never started: it failed, nothing waits on it. */
export const failGeneration = (db: DbClient, generationId: string) =>
  new DocumentsRepository(db).updateGeneration(generationId, {
    status: "failed",
    finishedAt: new Date(),
  });
