import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "../documents-repository";
import { failGeneration } from "../documents-service";
import { letterResumeState } from "./letter-resume";
import { requireUserVersion } from "../require-version";
import type { OutputLanguage, WritingLevel } from "../schemas/document";

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

/**
 * Cover letters from the user's side (resume spec, "Cover letter and its
 * resume"): generated with or without a resume version of the same
 * application, recording the exact resume snapshot used; once that resume
 * changes, updated as a proposal, generated again, or the notice dismissed.
 */
export class LetterService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db)
  ) {}

  private async start(userId: string, generationId: string, maximum: boolean) {
    const { realtime } = await this.tasks.startOrUndo(
      {
        userId,
        type: "generate_document",
        subjectId: generationId,
        hints: { documentKind: "cover_letter", maximum },
      },
      () => failGeneration(this.db, generationId)
    );
    return { generationId, realtime };
  }

  /** Generates a letter: a new version, or into an existing one again. */
  async generate(input: {
    userId: string;
    openingId: string;
    language: OutputLanguage;
    tone: Tone;
    writingLevel: WritingLevel;
    resumeVersionId: string | null;
    versionId?: string;
  }): Promise<{ generationId: string; realtime: RealtimeSubscription }> {
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "generate_document",
      hints: {
        documentKind: "cover_letter",
        maximum: input.writingLevel === "maximum",
      },
    });
    const generation = await this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const profile = await new CareerRepository(tx).findProfileByUserId(
        input.userId
      );
      const opening =
        profile &&
        (await new OpeningsRepository(tx).findOpening({
          profileId: profile.id,
          openingId: input.openingId,
        }));
      if (!profile || !opening) throw notFound();
      const application = await repository.findOrInsertApplication({
        profileId: profile.id,
        openingId: opening.id,
      });
      const document = await repository.findOrInsertApplicationDocument({
        profileId: profile.id,
        applicationId: application.id,
        kind: "cover_letter",
      });
      const existing = input.versionId
        ? await repository.findVersion(input.versionId)
        : null;
      if (input.versionId && existing?.documentId !== document.id) {
        throw notFound();
      }
      // A letter tells one story (resume spec), once the interview chose
      // one. Profile_truth replaces this in P8 (docs/plan.md): no stories
      // exist, so none is required.
      // The resume it accompanies: a version of this application's resume.
      const resume = input.resumeVersionId
        ? await requireUserVersion(tx, input.userId, input.resumeVersionId)
        : null;
      if (
        resume &&
        (resume.document.kind !== "resume" ||
          resume.document.applicationId !== application.id)
      ) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      const resumeSnapshot =
        resume && (await repository.latestSnapshot(resume.version.id));
      return repository.insertGeneration({
        profileId: profile.id,
        documentId: document.id,
        versionId: existing?.id ?? null,
        // Into a version, its language: a letter never changes language.
        language: existing?.language ?? input.language,
        reviewDepth: "quick",
        writingLevel: input.writingLevel,
        tone: input.tone,
        resumeVersionId: resume?.version.id ?? null,
        resumeSnapshotId: resumeSnapshot?.id ?? null,
      });
    });
    return this.start(
      input.userId,
      generation.id,
      input.writingLevel === "maximum"
    );
  }

  /** The letter version, its latest snapshot and the resume that changed. */
  private async requireOutdatedLetter(
    tx: DbClient,
    userId: string,
    versionId: string,
    { lock = false } = {}
  ) {
    const repository = new DocumentsRepository(tx);
    const { version, document, profile } = await requireUserVersion(
      tx,
      userId,
      versionId,
      { lock }
    );
    if (document.kind !== "cover_letter") throw notFound();
    const latest = await repository.latestSnapshot(version.id);
    if (!latest) throw notFound();
    const state = await letterResumeState(repository, latest, version);
    if (!state.resumeLatest || state.resumeLatest.id === state.usedSnapshotId) {
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    }
    return {
      version,
      document,
      profile,
      latest,
      state,
      resumeLatest: state.resumeLatest,
    };
  }

  /**
   * "Update the cover letter": adjusts only the passages affected by what
   * changed in the resume, as a proposal the user reviews.
   */
  async update(input: {
    userId: string;
    versionId: string;
  }): Promise<{ generationId: string; realtime: RealtimeSubscription }> {
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "generate_document",
      hints: { documentKind: "cover_letter" },
    });
    const generation = await this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const { version, document, profile, latest, state, resumeLatest } =
        await this.requireOutdatedLetter(tx, input.userId, input.versionId, {
          lock: true,
        });
      // One proposal at a time: a pending one is reviewed first.
      if (await repository.pendingProposal(document.id)) {
        throw new TRPCError({ code: "CONFLICT" });
      }
      const application = document.applicationId
        ? await repository.findApplication(document.applicationId)
        : null;
      return repository.insertGeneration({
        profileId: profile.id,
        documentId: document.id,
        kind: "letter_update",
        versionId: version.id,
        language: version.language,
        targetSnapshotId: latest.id,
        // The resume snapshot the letter used, to diff against.
        sourceSnapshotId: state.usedSnapshotId,
        resumeVersionId: state.resumeVersionId,
        resumeSnapshotId: resumeLatest.id,
        reviewDepth: "quick",
        writingLevel: "standard",
        tone: application?.tone ?? "your_style",
      });
    });
    return this.start(input.userId, generation.id, false);
  }

  /** Keeps the letter as it is: no notice until the resume changes again. */
  async dismissOutdated(input: { userId: string; versionId: string }) {
    await this.db.transaction(async (tx) => {
      const { version, resumeLatest } = await this.requireOutdatedLetter(
        tx,
        input.userId,
        input.versionId,
        { lock: true }
      );
      await new DocumentsRepository(tx).updateVersion(version.id, {
        dismissedResumeSnapshotId: resumeLatest.id,
      });
    });
  }
}
