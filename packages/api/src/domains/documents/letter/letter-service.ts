import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { MotivationRepository } from "@repo/api/domains/applications/motivation/motivation-repository";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "../documents-repository";
import { writtenSettings } from "../coverage-review/snapshot-coverage";
import { failGeneration } from "../documents-service";
import { freezeGeneration } from "../generation/generation-request";
import { loadProfileSource } from "../generation/load-profile-source";
import { letterResumeState } from "./letter-resume";
import { requireUserVersion } from "../require-version";
import type { OutputLanguage, WritingLevel } from "../schemas/document";
import type { GenerationSettings } from "../schemas/generation-settings";
import type { LetterStoryView } from "../schemas/letter-story";
import { rankStories } from "./rank-stories";

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

  private async requireProfile(userId: string) {
    const profile = await new CareerRepository(this.db).findProfileByUserId(
      userId
    );
    if (!profile) throw notFound();
    return profile;
  }

  /**
   * The stories the profile tells, ranked by similarity to the opening: the
   * top three, for the user to pick one (resume spec, "Story choice").
   */
  async stories(input: {
    userId: string;
    openingId: string;
  }): Promise<LetterStoryView[]> {
    const profile = await this.requireProfile(input.userId);
    const opening = await new OpeningsRepository(this.db).findOpening({
      profileId: profile.id,
      openingId: input.openingId,
    });
    if (!opening) throw notFound();
    return rankStories({
      db: this.db,
      cipher: await getUserCipher(this.db, input.userId),
      profileId: profile.id,
      openingId: opening.id,
    });
  }

  /**
   * Generates a letter: a new version, or into an existing one again. Like
   * a resume, it freezes what it is asked with (ADR 0008): the profile
   * version (the one its resume was written from, when it has one, so the
   * lines they cite are the same; else the one published now) and the
   * settings of the form. Nothing is generated before a profile is
   * published.
   */
  async generate(input: {
    userId: string;
    openingId: string;
    language: OutputLanguage;
    tone: Tone;
    writingLevel: WritingLevel;
    resumeVersionId: string | null;
    versionId?: string;
    /** What the user changed in the settings form, for this document. */
    settings?: Partial<GenerationSettings>;
    /** The story picked from `stories`: a results line of the profile. */
    storyLineId?: string | null;
  }): Promise<{ generationId: string; realtime: RealtimeSubscription }> {
    const profile = await this.requireProfile(input.userId);
    const cipher = await getUserCipher(this.db, input.userId);
    const frozen = await freezeGeneration({
      db: this.db,
      cipher,
      userId: input.userId,
      profileId: profile.id,
      settings: input.settings,
    });
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
      const opening = await new OpeningsRepository(tx).findOpening({
        profileId: profile.id,
        openingId: input.openingId,
      });
      if (!opening) throw notFound();
      // Like a resume, only an analyzed opening gets a letter.
      if (opening.status !== "analyzed") {
        throw new TRPCError({ code: "PRECONDITION_FAILED" });
      }
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
      const profileVersionId =
        resumeSnapshot?.profileVersionId ?? frozen.profileVersionId;
      // The story, a results line of the version published now; the
      // letter's version may be the resume's older one, where it is found
      // again by its words.
      let storyLineId: string | null = null;
      // No story picked: the one the motivation interview was about, found
      // again by its words in the profile version the letter reads.
      if (input.storyLineId === undefined) {
        const interview = await new MotivationRepository(
          tx
        ).findInterviewByOpening(opening.id);
        if (interview?.encryptedStory) {
          const story = cipher.decrypt(interview.encryptedStory);
          const source = await loadProfileSource({
            db: tx,
            cipher,
            profileId: profile.id,
            profileVersionId,
          });
          storyLineId =
            source?.evidence.find(
              (line) =>
                line.kind === "achievement" &&
                line.text === story &&
                (!interview.storyPositionId ||
                  line.positionId === interview.storyPositionId)
            )?.id ?? null;
        }
      }
      if (input.storyLineId) {
        const source = (version: string) =>
          loadProfileSource({
            db: tx,
            cipher,
            profileId: profile.id,
            profileVersionId: version,
          });
        const chosen = (await source(frozen.profileVersionId))?.evidence.find(
          (line) => line.id === input.storyLineId && line.kind === "achievement"
        );
        if (!chosen) throw new TRPCError({ code: "BAD_REQUEST" });
        storyLineId =
          profileVersionId === frozen.profileVersionId
            ? chosen.id
            : ((await source(profileVersionId))?.evidence.find(
                (line) =>
                  line.positionId === chosen.positionId &&
                  line.text === chosen.text
              )?.id ?? null);
      }
      return repository.insertGeneration({
        profileId: profile.id,
        documentId: document.id,
        versionId: existing?.id ?? null,
        // Into a version, its language: a letter never changes language.
        language: existing?.language ?? input.language,
        profileVersionId,
        settings: frozen.settings,
        storyLineId,
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
    // A letter from before snapshots carried their version reads the one
    // published now.
    const published = await freezeGeneration({
      db: this.db,
      cipher: await getUserCipher(this.db, input.userId),
      userId: input.userId,
      profileId: (await this.requireProfile(input.userId)).id,
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
        // What the letter was written under, whatever was published since.
        profileVersionId: latest.profileVersionId ?? published.profileVersionId,
        settings: await writtenSettings(repository, version),
        // The story the letter was written around stays the one told.
        storyLineId:
          (await repository.latestWrittenGeneration(version.id))?.storyLineId ??
          null,
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
