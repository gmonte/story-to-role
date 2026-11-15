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

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

/** How many stories the user chooses from (resume spec: the top three). */
const storyChoices = 3;
/** How much evidence is retrieved to rank stories by. */
const rankedEvidence = 60;

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
      return {
        interviewId: interview.id,
        status: interview.status,
        storyId: interview.storyId,
        // An answer (or nothing yet) waits for the interviewer's next step.
        thinking:
          interview.status === "in_progress" &&
          (turns.length === 0 || turns.at(-1)!.role === "answer"),
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
   * The approved stories closest to the opening, by the vectors of their
   * evidence, each with the requirements its evidence answers in the fit
   * check: why it fits. No AI call.
   */
  async storyChoices(input: {
    userId: string;
    openingId: string;
  }): Promise<StoryChoice[]> {
    const { profile, opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    return this.db.transaction(async (tx) => {
      const openings = new OpeningsRepository(tx);
      const cipher = await getUserCipher(tx, input.userId);
      const stories = await new EvidenceRepository(tx).listStories(profile.id);
      const rank = new Map(
        opening.embedding
          ? (
              await openings.nearestEvidence({
                profileId: profile.id,
                embedding: opening.embedding,
                limit: rankedEvidence,
              })
            ).map((row, index) => [row.id, index])
          : []
      );
      const score = (evidenceIds: string[]) =>
        Math.min(...evidenceIds.map((id) => rank.get(id) ?? Infinity));
      const ranked = [...stories]
        .sort((a, b) => score(a.evidenceIds) - score(b.evidenceIds))
        .slice(0, storyChoices);

      const [fitCheck] = await openings.latestFitChecks([opening.id]);
      const items = fitCheck
        ? await openings.listFitCheckItems(fitCheck.id)
        : [];
      const terms = new Map(
        (await openings.listTerms(opening.id)).map((term) => [
          term.id,
          cipher.decrypt(term.encryptedText),
        ])
      );
      const positions = await new CareerRepository(tx).listPositions(
        profile.id
      );
      return ranked.map((story) => {
        const position = positions.find((row) => row.id === story.positionId);
        return {
          storyId: story.id,
          problem: cipher.decrypt(story.encryptedProblem),
          result: cipher.decrypt(story.encryptedResult),
          position: position
            ? `${cipher.decrypt(position.encryptedTitle)} · ${cipher.decrypt(position.encryptedEmployer)}`
            : null,
          fits: items
            .filter(
              (item) =>
                item.verdict !== "gap" &&
                item.evidenceIds.some((id) => story.evidenceIds.includes(id))
            )
            .flatMap((item) => terms.get(item.termId) ?? []),
        };
      });
    });
  }

  private async askNext(userId: string, interviewId: string) {
    const { realtime } = await this.tasks.start({
      userId,
      type: "motivation_turn",
      subjectId: interviewId,
    });
    return { realtime };
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
    const interview = await this.db.transaction(async (tx) => {
      if (input.storyId) {
        const stories = await new EvidenceRepository(tx).listStories(
          profile.id
        );
        if (!stories.some((story) => story.id === input.storyId)) {
          throw notFound();
        }
      }
      return new MotivationRepository(tx).replaceInterview({
        profileId: profile.id,
        openingId: opening.id,
        storyId: input.storyId,
      });
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
    const interviewId = await this.db.transaction(async (tx) => {
      const repository = new MotivationRepository(tx);
      const found = await repository.findInterviewByOpening(opening.id);
      const interview = found && (await repository.lockInterview(found.id));
      if (interview?.status !== "in_progress") {
        throw new TRPCError({ code: "PRECONDITION_FAILED" });
      }
      // One answer per question: the interviewer must have asked.
      const turns = await repository.listTurns(interview.id);
      if (turns.length === 0 || turns.at(-1)!.role === "answer") {
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
   * The user's decision on each goal or story detail: saved, it becomes a
   * career goal or new evidence of the story (approved now, the user's
   * words as the quote); otherwise it stays in this application.
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
      const story = interview.storyId
        ? (await evidence.listStories(profile.id)).find(
            (row) => row.id === interview.storyId
          )
        : null;
      const approvedAt = new Date();

      const goals = drafts.filter(
        (point) => point.kind === "goal" && saved.has(point.id)
      );
      await evidence.insertCareerGoals(
        goals.map((point) => ({
          profileId: profile.id,
          encryptedText: point.encryptedText,
          language: profile.interviewLanguage,
          sourcePointId: point.id,
          approvedAt,
        }))
      );
      const details = story
        ? drafts.filter(
            (point) => point.kind === "story_detail" && saved.has(point.id)
          )
        : [];
      if (story && details.length > 0) {
        const rows = await evidence.insertEvidence(
          details.map((point) => ({
            profileId: profile.id,
            positionId: story.positionId,
            credentialId: story.credentialId,
            kind: "achievement" as const,
            encryptedText: point.encryptedText,
            encryptedSourceQuote: point.encryptedText,
            language: profile.interviewLanguage,
            approvedAt,
          }))
        );
        await evidence.updateStoryEvidence({
          storyId: story.id,
          evidenceIds: [...story.evidenceIds, ...rows.map((row) => row.id)],
        });
      }
      const promoted = [...goals, ...details].map((point) => point.id);
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
