import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import {
  type SuggestionTarget,
  suggestLine,
} from "@repo/api/domains/profile/suggestions/suggest-line";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "../documents-repository";
import { requireUserVersion } from "../require-version";
import type { LinkedinInterviewView } from "../schemas/linkedin-interview";
import { decryptDocument } from "../snapshot-content";
import { LinkedinInterviewRepository } from "./linkedin-interview-repository";
import { redoableSection } from "./linkedin-resume";
import { awaitingInterviewer } from "./run-linkedin-turn";

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

/** Longer than a turn may take: the interviewer is gone, not thinking. */
const staleTurnMs = 3 * 60_000;

/**
 * A LinkedIn step's questions (resume spec, "LinkedIn", "Step by step"):
 * up to three short questions about what the profile lacks for the
 * section, asked in tasks and priced like the motivation interview's; the
 * answers become LinkedIn instructions the writer cites, which the user
 * may remove.
 */
export class LinkedinInterviewService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db)
  ) {}

  /** The version's LinkedIn document, with a section its text has. */
  private async requireSection(input: {
    userId: string;
    versionId: string;
    section: string;
  }) {
    const { version, document, profile } = await requireUserVersion(
      this.db,
      input.userId,
      input.versionId
    );
    if (document.kind !== "linkedin") throw notFound();
    const latest = await new DocumentsRepository(this.db).latestSnapshot(
      version.id
    );
    const cipher = await getUserCipher(this.db, input.userId);
    const content = latest ? decryptDocument(cipher, latest) : null;
    if (
      content?.kind !== "linkedin" ||
      !redoableSection(content, input.section)
    )
      throw notFound();
    return { document, profile, cipher };
  }

  async get(input: {
    userId: string;
    versionId: string;
    section: string;
  }): Promise<LinkedinInterviewView> {
    // A run that crashed is failed first, so the page stops waiting.
    await this.tasks.failCrashed(input.userId);
    const { document, cipher } = await this.requireSection(input);
    const repository = new LinkedinInterviewRepository(this.db);
    const instructions = (
      await repository.listKeptInstructions(document.id)
    ).filter((row) => row.section === input.section);
    const interview = await repository.findInterviewBySection(
      document.id,
      input.section
    );
    const turns = interview ? await repository.listTurns(interview.id) : [];
    const waiting =
      interview?.status === "in_progress" && awaitingInterviewer(turns);
    // A turn that never came back: the interview failed, it can restart.
    const since = (turns.at(-1)?.createdAt ?? interview?.createdAt)?.getTime();
    const stale = waiting && !!since && Date.now() - since >= staleTurnMs;
    return {
      interviewId: interview?.id ?? null,
      status: interview ? (stale ? "failed" : interview.status) : null,
      thinking: waiting && !stale,
      turns: turns.map((turn) => ({
        role: turn.role,
        text: cipher.decrypt(turn.encryptedText),
      })),
      instructions: instructions.map((row) => ({
        id: row.id,
        text: cipher.decrypt(row.encryptedText),
        positionId: row.positionId,
        projectId: row.projectId,
        credentialId: row.credentialId,
        sent: row.status === "promoted",
      })),
    };
  }

  /** Starts the interviewer's turn; a start that fails fails the interview. */
  private async askNext(userId: string, interviewId: string) {
    try {
      const { realtime } = await this.tasks.start({
        userId,
        type: "linkedin_turn",
        subjectId: interviewId,
      });
      return { realtime };
    } catch (error) {
      await new LinkedinInterviewRepository(this.db).updateInterview(
        interviewId,
        { status: "failed" }
      );
      throw error;
    }
  }

  /** Starts (or starts over) a step's questions. */
  async start(input: {
    userId: string;
    versionId: string;
    section: string;
  }): Promise<{ interviewId: string; realtime: RealtimeSubscription }> {
    const { document, profile } = await this.requireSection(input);
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "linkedin_turn",
    });
    const interview = await new LinkedinInterviewRepository(
      this.db
    ).replaceInterview({
      profileId: profile.id,
      documentId: document.id,
      section: input.section,
    });
    const { realtime } = await this.askNext(input.userId, interview.id);
    return { interviewId: interview.id, realtime };
  }

  /** The interview, if it is the user's. */
  private async requireInterview(userId: string, interviewId: string) {
    const repository = new LinkedinInterviewRepository(this.db);
    const interview = await repository.findInterview(interviewId);
    const document =
      interview &&
      (await new DocumentsRepository(this.db).findDocument(
        interview.documentId
      ));
    const profile =
      document &&
      (await new CareerRepository(this.db).findProfileByUserId(userId));
    if (!interview || profile?.id !== document?.profileId) throw notFound();
    return interview;
  }

  /** The user's answer to the current question, by voice or text. */
  async answer(input: {
    userId: string;
    interviewId: string;
    text: string;
  }): Promise<{ realtime: RealtimeSubscription }> {
    const interview = await this.requireInterview(
      input.userId,
      input.interviewId
    );
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "linkedin_turn",
    });
    const cipher = await getUserCipher(this.db, input.userId);
    await this.db.transaction(async (tx) => {
      const repository = new LinkedinInterviewRepository(tx);
      const locked = await repository.lockInterview(interview.id);
      const turns = await repository.listTurns(interview.id);
      if (locked?.status !== "in_progress" || awaitingInterviewer(turns))
        throw new TRPCError({ code: "CONFLICT" });
      await repository.insertTurn({
        interviewId: interview.id,
        role: "answer",
        encryptedText: cipher.encrypt(input.text.trim()),
      });
    });
    return this.askNext(input.userId, interview.id);
  }

  /** Skips the rest of a step's questions: what was answered stays. */
  async skip(input: { userId: string; interviewId: string }): Promise<void> {
    const interview = await this.requireInterview(
      input.userId,
      input.interviewId
    );
    await new LinkedinInterviewRepository(this.db).updateInterview(
      interview.id,
      { status: "skipped" }
    );
  }

  /**
   * Sends a LinkedIn instruction to the profile's draft as a suggestion
   * (origin `linkedin`): under its position's or project's Results, the
   * career direction for a headline answer, or the seniority and areas
   * line otherwise. The writer keeps reading it; a later resume or letter
   * uses it only once the user accepts it and publishes.
   */
  async sendToProfile(input: {
    userId: string;
    linkedinInstructionId: string;
  }): Promise<{ profileSuggestionId: string }> {
    const repository = new LinkedinInterviewRepository(this.db);
    const instruction = await repository.findInstruction(
      input.linkedinInstructionId
    );
    const profile = await new CareerRepository(this.db).findProfileByUserId(
      input.userId
    );
    if (
      instruction?.profileId !== profile?.id ||
      instruction.status === "removed"
    )
      throw notFound();
    if (instruction.status === "promoted")
      throw new TRPCError({ code: "CONFLICT" });
    const cipher = await getUserCipher(this.db, input.userId);
    const general: SuggestionTarget =
      instruction.section === "headline"
        ? { kind: "careerDirection" }
        : { kind: "identityAreas" };
    const { profileSuggestionId } = await suggestLine({
      db: this.db,
      cipher,
      userId: input.userId,
      careerProfileId: profile.id,
      target: instruction.positionId
        ? {
            kind: "experience",
            positionId: instruction.positionId,
            field: "results",
          }
        : instruction.projectId
          ? {
              kind: "project",
              projectId: instruction.projectId,
              field: "results",
            }
          : general,
      fallback: general,
      text: cipher.decrypt(instruction.encryptedText),
      reason: {
        "en-US": "You said this answering the questions of your LinkedIn.",
        "pt-BR": "Você disse isto respondendo às perguntas do seu LinkedIn.",
      },
      origin: "linkedin",
    });
    await repository.updateInstruction(instruction.id, { status: "promoted" });
    return { profileSuggestionId };
  }

  /** Removes a LinkedIn instruction: the writer no longer reads it. */
  async removeInstruction(input: {
    userId: string;
    linkedinInstructionId: string;
  }): Promise<void> {
    const repository = new LinkedinInterviewRepository(this.db);
    const instruction = await repository.findInstruction(
      input.linkedinInstructionId
    );
    const profile = await new CareerRepository(this.db).findProfileByUserId(
      input.userId
    );
    if (instruction?.profileId !== profile?.id) throw notFound();
    await repository.updateInstruction(instruction.id, { status: "removed" });
  }
}
