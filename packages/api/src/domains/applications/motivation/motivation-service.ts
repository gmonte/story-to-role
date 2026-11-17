import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadProfileSource } from "@repo/api/domains/documents/generation/load-profile-source";
import { suggestLine } from "@repo/api/domains/profile/suggestions/suggest-line";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";

import type {
  MotivationSendResult,
  MotivationView,
} from "../schemas/motivation";
import { MotivationRepository } from "./motivation-repository";
import { awaitingInterviewer } from "./motivation-turns";

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

/** Longer than a turn may take: the interviewer is gone, not thinking. */
const staleTurnMs = 3 * 60_000;

/**
 * The cover letter's motivation interview (resume spec, "Cover letter
 * inputs"): a few short questions asked in tasks; its points stay in the
 * application or, chosen one by one, become suggestions in the profile's
 * draft: points about the user for its career direction, details of the
 * letter's story for that story's experience.
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

  /**
   * Starts (or starts over) the interview. With the story the letter will
   * tell (a results line of the published profile, from `letter.stories`),
   * it also asks about its turning point.
   */
  async start(input: {
    userId: string;
    openingId: string;
    storyLineId?: string;
  }): Promise<{ realtime: RealtimeSubscription }> {
    const { profile, opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "motivation_turn",
    });
    const cipher = await getUserCipher(this.db, input.userId);
    const story = input.storyLineId
      ? (
          await loadProfileSource({
            db: this.db,
            cipher,
            profileId: profile.id,
          })
        )?.evidence.find(
          (line) => line.id === input.storyLineId && line.kind === "achievement"
        )
      : null;
    if (input.storyLineId && !story)
      throw new TRPCError({ code: "BAD_REQUEST" });
    const interview = await new MotivationRepository(this.db).replaceInterview({
      profileId: profile.id,
      openingId: opening.id,
      storyPositionId: story?.positionId ?? null,
      encryptedStory: story ? cipher.encrypt(story.text) : null,
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
  async skip(input: { userId: string; openingId: string }) {
    const { profile, opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    await this.db.transaction(async (tx) => {
      const repository = new MotivationRepository(tx);
      const interview = await repository.findInterviewByOpening(opening.id);
      if (interview) {
        await repository.updateInterview(interview.id, { status: "skipped" });
      } else {
        await repository.replaceInterview({
          profileId: profile.id,
          openingId: opening.id,
          status: "skipped",
        });
      }
    });
  }

  /**
   * The user's decision on each point (resume spec, "Cover letter
   * inputs"): a point about the user saved goes to the profile's draft as a
   * suggestion for the career direction line under Professional identity,
   * and a saved detail of the story as one for that story's experience;
   * never a change, the user accepts it there. Everything else, and what
   * the draft refuses, stays in this application.
   */
  async confirm(input: {
    userId: string;
    openingId: string;
    decisions: Array<{ motivationPointId: string; save: boolean }>;
  }): Promise<{ sent: MotivationSendResult[] }> {
    const { profile, opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    const { interview, toSend } = await this.db.transaction(async (tx) => {
      const repository = new MotivationRepository(tx);
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
      // Locked: a second submit finds no drafts left.
      const drafts = (await repository.listPoints(interview.id)).filter(
        (point) => point.status === "draft"
      );
      await repository.updatePoints(
        drafts.map((point) => point.id),
        { status: "kept" }
      );
      return {
        interview,
        toSend: drafts.filter(
          (point) => point.kind !== "company" && saved.has(point.id)
        ),
      };
    });
    if (toSend.length === 0) return { sent: [] };

    const cipher = await getUserCipher(this.db, input.userId);
    const title = [opening.encryptedCompany, opening.encryptedTitle]
      .map((value) => (value ? cipher.decrypt(value) : ""))
      .filter(Boolean)
      .join(" — ");
    const repository = new MotivationRepository(this.db);
    const sent: MotivationSendResult[] = [];
    for (const point of toSend) {
      // A story detail needs its story's experience.
      if (point.kind === "story_detail" && !interview.storyPositionId) continue;
      try {
        const { profileSuggestionId } = await suggestLine({
          db: this.db,
          cipher,
          userId: input.userId,
          careerProfileId: profile.id,
          target:
            point.kind === "story_detail"
              ? {
                  kind: "experience",
                  positionId: interview.storyPositionId!,
                  field: "results",
                }
              : { kind: "careerDirection" },
          text: cipher.decrypt(point.encryptedText),
          reason: {
            "en-US": `You said this in the motivation interview for ${title}.`,
            "pt-BR": `Você disse isto na entrevista de motivação para ${title}.`,
          },
        });
        await repository.updatePoints([point.id], { status: "promoted" });
        sent.push({ motivationPointId: point.id, profileSuggestionId });
      } catch (error) {
        // Refused, or already in the profile: it stays in this application.
        if (!(error instanceof TRPCError)) throw error;
      }
    }
    return { sent };
  }
}
