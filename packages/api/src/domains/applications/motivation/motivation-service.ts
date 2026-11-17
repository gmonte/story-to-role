import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { EvidenceRepository } from "@repo/api/domains/evidence/evidence-repository";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";

import type { MotivationView, StoryChoice } from "../schemas/motivation";
import { MotivationRepository } from "./motivation-repository";
import { awaitingInterviewer } from "./motivation-turns";

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

/** Longer than a turn may take: the interviewer is gone, not thinking. */
const staleTurnMs = 3 * 60_000;

/**
 * The cover letter's motivation interview and story choice (resume spec,
 * "Cover letter inputs"): the story is chosen among the user's approved
 * stories closest to the opening; the interview asks a few short questions
 * in tasks; its points stay in the application or, approved one by one,
 * become career goals or enrich the story.
 */
export class MotivationService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db)
  ) {}

  private async requireOpening(userId: string, openingId: string) {
    const profile = await new CareerRepository(this.db).findProfileByUserId(
      userId
    );
    const opening =
      profile &&
      (await new OpeningsRepository(this.db).findOpening({
        profileId: profile.id,
        openingId,
      }));
    if (!profile || !opening) throw notFound();
    return { profile, opening };
  }

  async get(input: {
    userId: string;
    openingId: string;
  }): Promise<MotivationView> {
    const { opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    return this.db.transaction(async (tx) => {
      const repository = new MotivationRepository(tx);
      const interview = await repository.findInterviewByOpening(opening.id);
      if (!interview) {
        return {
          interviewId: null,
          status: null,
          storyId: null,
          thinking: false,
          turns: [],
          points: [],
        };
      }
      const cipher = await getUserCipher(tx, input.userId);
      const turns = await repository.listTurns(interview.id);
      const waiting =
        interview.status === "in_progress" && awaitingInterviewer(turns);
      // A turn that never came back: the interview failed, it can restart.
      const since = (turns.at(-1)?.createdAt ?? interview.createdAt).getTime();
      const stale = waiting && Date.now() - since >= staleTurnMs;
      return {
        interviewId: interview.id,
        status: stale ? "failed" : interview.status,
        storyId: interview.storyId,
        thinking: waiting && !stale,
        turns: turns.map((turn) => ({
          role: turn.role,
          text: cipher.decrypt(turn.encryptedText),
        })),
        points: (await repository.listPoints(interview.id))
          .filter((point) => point.status !== "removed")
          .map((point) => ({
            id: point.id,
            kind: point.kind,
            text: cipher.decrypt(point.encryptedText),
            suggested: point.suggested,
            status: point.status,
          })),
      };
    });
  }

  /**
   * The stories the letter may tell, closest to the opening. None for now:
   * stories went with the old evidence base.
   */
  async storyChoices(input: {
    userId: string;
    openingId: string;
  }): Promise<StoryChoice[]> {
    await this.requireOpening(input.userId, input.openingId);
    // Profile_truth replaces this in P8 (docs/plan.md).
    return [];
  }

  /** Starts the interviewer's turn; a start that fails fails the interview. */
  private async askNext(userId: string, interviewId: string) {
    try {
      const { realtime } = await this.tasks.start({
        userId,
        type: "motivation_turn",
        subjectId: interviewId,
      });
      return { realtime };
    } catch (error) {
      await new MotivationRepository(this.db).updateInterview(interviewId, {
        status: "failed",
      });
      throw error;
    }
  }

  /** Starts (or starts over) the interview, with the story the letter tells. */
  async start(input: {
    userId: string;
    openingId: string;
    storyId: string | null;
  }): Promise<{ realtime: RealtimeSubscription }> {
    const { profile, opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "motivation_turn",
    });
    // Profile_truth replaces this in P8 (docs/plan.md): no story exists.
    if (input.storyId) throw notFound();
    const interview = await new MotivationRepository(this.db).replaceInterview({
      profileId: profile.id,
      openingId: opening.id,
      storyId: null,
    });
    return this.askNext(input.userId, interview.id);
  }

  /** The user's answer to the current question, by voice or text. */
  async answer(input: {
    userId: string;
    openingId: string;
    text: string;
  }): Promise<{ realtime: RealtimeSubscription }> {
    const { opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    // Before the answer is stored: none is left without a next question.
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "motivation_turn",
    });
    const interviewId = await this.db.transaction(async (tx) => {
      const repository = new MotivationRepository(tx);
      const found = await repository.findInterviewByOpening(opening.id);
      const interview = found && (await repository.lockInterview(found.id));
      if (interview?.status !== "in_progress") {
        throw new TRPCError({ code: "PRECONDITION_FAILED" });
      }
      // One answer per question: the interviewer must have asked.
      const turns = await repository.listTurns(interview.id);
      if (awaitingInterviewer(turns)) {
        throw new TRPCError({ code: "CONFLICT" });
      }
      const cipher = await getUserCipher(tx, input.userId);
      await repository.insertTurn({
        interviewId: interview.id,
        role: "answer",
        encryptedText: cipher.encrypt(input.text.trim()),
      });
      return interview.id;
    });
    return this.askNext(input.userId, interviewId);
  }

  /** Skipping: the letter is then marked "could improve with your motivation". */
  async skip(input: {
    userId: string;
    openingId: string;
    // The story still matters: the letter tells it without the interview.
    storyId: string | null;
  }) {
    const { profile, opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    // Profile_truth replaces this in P8 (docs/plan.md): no story exists.
    if (input.storyId) throw notFound();
    await this.db.transaction(async (tx) => {
      const repository = new MotivationRepository(tx);
      const interview = await repository.findInterviewByOpening(opening.id);
      if (interview) {
        await repository.updateInterview(interview.id, {
          status: "skipped",
          storyId: interview.storyId,
        });
      } else {
        await repository.replaceInterview({
          profileId: profile.id,
          openingId: opening.id,
          status: "skipped",
          storyId: null,
        });
      }
    });
  }

  /**
   * The user's decision on each goal: saved, it becomes a career goal;
   * otherwise (and every story detail) it stays in this application.
   */
  async confirm(input: {
    userId: string;
    openingId: string;
    decisions: Array<{ motivationPointId: string; save: boolean }>;
  }) {
    const { profile, opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    await this.db.transaction(async (tx) => {
      const repository = new MotivationRepository(tx);
      const evidence = new EvidenceRepository(tx);
      const found = await repository.findInterviewByOpening(opening.id);
      const interview = found && (await repository.lockInterview(found.id));
      if (interview?.status !== "finished") {
        throw new TRPCError({ code: "PRECONDITION_FAILED" });
      }
      const saved = new Set(
        input.decisions
          .filter((decision) => decision.save)
          .map((decision) => decision.motivationPointId)
      );
      const drafts = (await repository.listPoints(interview.id)).filter(
        (point) => point.status === "draft"
      );
      const approvedAt = new Date();

      const goals = drafts.filter(
        (point) => point.kind === "goal" && saved.has(point.id)
      );
      await evidence.insertCareerGoals(
        goals.map((point) => ({
          profileId: profile.id,
          encryptedText: point.encryptedText,
          language: profile.interviewLanguage,
          source: "motivation_interview" as const,
          sourcePointId: point.id,
          approvedAt,
        }))
      );
      // Profile_truth replaces this in P8 (docs/plan.md): a story detail
      // has no story to enrich, so it stays in this application.
      const promoted = goals.map((point) => point.id);
      await repository.updatePoints(promoted, { status: "promoted" });
      await repository.updatePoints(
        drafts
          .filter((point) => !promoted.includes(point.id))
          .map((point) => point.id),
        { status: "kept" }
      );
    });
  }
}
