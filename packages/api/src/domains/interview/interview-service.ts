import { TRPCError } from "@trpc/server";

import { currentPlan } from "@repo/api/domains/credits/credit-plan";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { ScriptKind } from "@repo/api/domains/career/schemas/career";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { EvidenceRepository } from "@repo/api/domains/evidence/evidence-repository";
import {
  defaultSensitivityChoice,
  type EvidenceKind,
  type SensitivityChoice,
} from "@repo/api/domains/evidence/schemas/evidence";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";

import { InterviewRepository } from "./interview-repository";
import { estimateTokens, interviewSettings } from "./interview-settings";
import type { ExtractionDecision, SessionView } from "./schemas/session-view";

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

const evidenceKinds: EvidenceKind[] = [
  "achievement",
  "responsibility",
  "metric",
  "tool",
  "award",
];

/** Old positions get the short script (guided interview spec). */
function scriptFor(endDate: string | null, stored: ScriptKind): ScriptKind {
  if (stored === "short" || !endDate) return stored;
  const years =
    (Date.now() - new Date(`${endDate}-01T00:00:00Z`).getTime()) /
    (365.25 * 24 * 3600 * 1000);
  return years > interviewSettings.shortScriptAfterYears ? "short" : stored;
}

/**
 * The guided interview from the user's side: sessions per position, turns
 * sent to a task, the approval of what was extracted and the sensitive-data
 * review. The agent never approves on the user's behalf: only these
 * methods, called by the user, write evidence.
 */
export class InterviewService {
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

  private async requireOpenSession(userId: string, sessionId: string) {
    const profile = await this.requireProfile(userId);
    const session = await new InterviewRepository(this.db).findSession({
      profileId: profile.id,
      sessionId,
    });
    if (session?.status !== "open") throw notFound();
    return { profile, session };
  }

  /**
   * Resumes the target's open session, or opens a fresh one. Reopening an
   * approved position starts a new session seeded with what was approved.
   */
  async openSession(input: {
    userId: string;
    positionId?: string;
    credentialId?: string;
  }) {
    // A session is about one target: a position, a credential, or none yet.
    if (input.positionId && input.credentialId) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }
    const profile = await this.requireProfile(input.userId);
    if (!profile.privacyNoticeAcceptedAt) {
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    }

    return this.db.transaction(async (tx) => {
      const interview = new InterviewRepository(tx);
      const career = new CareerRepository(tx);

      const open = (await interview.listSessions(profile.id)).find(
        (session) =>
          session.status === "open" &&
          session.positionId === (input.positionId ?? null) &&
          session.credentialId === (input.credentialId ?? null)
      );
      if (open) {
        // An import may have opened the session before the user did.
        if (open.positionId) {
          await career.updatePosition(open.positionId, {
            status: "in_progress",
          });
        }
        return { sessionId: open.id };
      }

      let scriptKind: ScriptKind = "full";
      if (input.positionId) {
        const position = await career.findPosition({
          profileId: profile.id,
          positionId: input.positionId,
        });
        if (!position || position.status === "removed") throw notFound();
        // The Free plan suggests the short script (guided interview spec,
        // "Short script"; billing spec, "Free plan"): its credits go
        // further. The user can always ask the interviewer for the full one.
        const free =
          (await currentPlan(tx, input.userId, new Date())).kind === "free";
        scriptKind = free
          ? "short"
          : scriptFor(position.endDate, position.scriptKind);
        await career.updatePosition(position.id, { status: "in_progress" });
      } else if (input.credentialId) {
        const credential = await career.findCredential({
          profileId: profile.id,
          credentialId: input.credentialId,
        });
        if (!credential) throw notFound();
        scriptKind = "short";
      }

      const session = await interview.insertSession({
        profileId: profile.id,
        positionId: input.positionId ?? null,
        credentialId: input.credentialId ?? null,
        scriptKind,
      });
      return { sessionId: session.id };
    });
  }

  async getSession(input: {
    userId: string;
    sessionId: string;
  }): Promise<SessionView> {
    const profile = await this.requireProfile(input.userId);
    return this.db.transaction(async (tx) => {
      const interview = new InterviewRepository(tx);
      const session = await interview.findSession({
        profileId: profile.id,
        sessionId: input.sessionId,
      });
      if (!session) throw notFound();
      const cipher = await getUserCipher(tx, input.userId);

      const [turns, drafts, flagged] = await Promise.all([
        interview.listTurns(session.id),
        interview.listDrafts(session.id),
        interview.listDraftSensitiveItems(session.id),
      ]);

      const required =
        session.turnTokens >= 2 * interviewSettings.checkpointTokens;
      const suggested =
        session.turnTokens >= interviewSettings.checkpointTokens;

      return {
        id: session.id,
        positionId: session.positionId,
        credentialId: session.credentialId,
        status: session.status,
        stage: session.stage,
        scriptKind: session.scriptKind,
        turns: turns.map((turn) => ({
          id: turn.id,
          role: turn.role,
          kind: turn.kind,
          content: turn.encryptedContent
            ? cipher.decrypt(turn.encryptedContent)
            : null,
          createdAt: turn.createdAt,
        })),
        drafts: drafts
          .filter((draft) => draft.status === "draft")
          .map((draft) => {
            const payload = JSON.parse(
              cipher.decrypt(draft.encryptedPayload)
            ) as {
              text?: string;
              problem?: string;
              action?: string;
              partners?: string;
              result?: string;
            };
            return {
              id: draft.id,
              kind: draft.kind,
              text: payload.text ?? null,
              story:
                draft.kind === "story"
                  ? {
                      problem: payload.problem ?? "",
                      action: payload.action ?? "",
                      partners: payload.partners,
                      result: payload.result ?? "",
                    }
                  : null,
              quote: cipher.decrypt(draft.encryptedQuote),
              fromDocument: !!draft.sourceDocumentId,
              language: draft.language,
              lowDetail: draft.lowDetail,
            };
          }),
        flaggedSensitiveItems: flagged.map((item) => ({
          kind: item.kind,
          original: cipher.decrypt(item.encryptedOriginal),
          suggestedGeneralization: item.encryptedSuggestedGeneralization
            ? cipher.decrypt(item.encryptedSuggestedGeneralization)
            : null,
        })),
        extractionProposed: !!session.extractionProposedAt,
        checkpoint: required ? "required" : suggested ? "suggested" : "none",
      };
    });
  }

  /**
   * Stores the user's message (encrypted) and starts the turn's task with
   * only ids. Past twice the checkpoint threshold the session must be
   * checkpointed first: the approval screen opens instead.
   */
  async sendMessage(input: {
    userId: string;
    sessionId: string;
    message: string;
  }): Promise<{ realtime: RealtimeSubscription }> {
    const message = input.message.trim();
    if (!message || message.length > interviewSettings.maxMessageCharacters) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }
    // Before the turn is stored: none is left without a reply.
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "interview_turn",
    });
    const { profile, session } = await this.requireOpenSession(
      input.userId,
      input.sessionId
    );

    if (session.turnTokens >= 2 * interviewSettings.checkpointTokens) {
      await new InterviewRepository(this.db).updateSession(session.id, {
        extractionProposedAt: session.extractionProposedAt ?? new Date(),
      });
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    }

    const turn = await this.db.transaction(async (tx) => {
      const cipher = await getUserCipher(tx, input.userId);
      const interview = new InterviewRepository(tx);
      // Answering again after the approval screen opened: another round.
      if (session.extractionProposedAt) {
        await interview.updateSession(session.id, {
          extractionProposedAt: null,
        });
      }
      return interview.insertTurn({
        sessionId: session.id,
        role: "user",
        encryptedContent: cipher.encrypt(message),
        language: profile.interviewLanguage,
        tokenCount: estimateTokens(message),
      });
    });

    const { realtime } = await this.tasks.start({
      userId: input.userId,
      type: "interview_turn",
      subjectId: turn.id,
    });
    return { realtime };
  }

  /** "I'm done with this position": open the approval screen now. */
  async proposeExtraction(input: { userId: string; sessionId: string }) {
    const { session } = await this.requireOpenSession(
      input.userId,
      input.sessionId
    );
    await new InterviewRepository(this.db).updateSession(session.id, {
      extractionProposedAt: new Date(),
    });
  }

  /**
   * The user's approval turns drafts into evidence: approved lines (as
   * edited) become evidence, stories and skills with their quotes; flagged
   * items go to the sensitive-data review. The session closes, so its turns
   * are never loaded again. Without `closePosition` (a checkpoint), the
   * interview continues in a fresh session for the same position.
   */
  async approveExtraction(input: {
    userId: string;
    sessionId: string;
    decisions: ExtractionDecision[];
    closePosition: boolean;
  }): Promise<{ nextSessionId: string | null }> {
    const { profile, session } = await this.requireOpenSession(
      input.userId,
      input.sessionId
    );

    const result = await this.db.transaction(async (tx) => {
      const interview = new InterviewRepository(tx);
      const evidence = new EvidenceRepository(tx);
      const career = new CareerRepository(tx);
      const cipher = await getUserCipher(tx, input.userId);
      const approvedAt = new Date();

      // Locked and re-checked: a second submit finds the session closed.
      const locked = await interview.findSessionForUpdate({
        profileId: profile.id,
        sessionId: session.id,
      });
      if (locked?.status !== "open") throw notFound();

      const drafts = (await interview.listDrafts(session.id)).filter(
        (draft) => draft.status === "draft"
      );
      const decisions = new Map(input.decisions.map((d) => [d.draftId, d]));
      const approved = drafts.filter(
        (draft) => decisions.get(draft.id)?.approved
      );
      const discarded = drafts.filter(
        (draft) => !decisions.get(draft.id)?.approved
      );

      const owner = {
        profileId: profile.id,
        positionId: session.positionId,
        credentialId: session.credentialId,
      };
      const payloadOf = (draft: (typeof drafts)[number]) => {
        const payload = JSON.parse(
          cipher.decrypt(draft.encryptedPayload)
        ) as Record<string, string | undefined>;
        const decision = decisions.get(draft.id);
        if (draft.kind === "story") return { ...payload, ...decision?.story };
        return decision?.text ? { ...payload, text: decision.text } : payload;
      };

      const evidenceDrafts = approved.filter((draft) =>
        (evidenceKinds as string[]).includes(draft.kind)
      );
      const evidenceRows = await evidence.insertEvidence(
        evidenceDrafts.map((draft) => ({
          ...owner,
          projectId: draft.projectId,
          kind: draft.kind as EvidenceKind,
          encryptedText: cipher.encrypt(payloadOf(draft).text ?? ""),
          encryptedSourceQuote: draft.encryptedQuote,
          sourceTurnId: draft.sourceTurnId,
          sourceDocumentId: draft.sourceDocumentId,
          language: draft.language,
          lowDetail: draft.lowDetail,
          approvedAt,
        }))
      );
      // A story or skill links the evidence told in the same message (or
      // found in the same document), never the whole session.
      const evidenceFromSameSource = (draft: (typeof drafts)[number]) =>
        evidenceRows
          .filter((_, index) => {
            const source = evidenceDrafts[index];
            return (
              (!!draft.sourceTurnId &&
                source.sourceTurnId === draft.sourceTurnId) ||
              (!!draft.sourceDocumentId &&
                source.sourceDocumentId === draft.sourceDocumentId)
            );
          })
          .map((row) => row.id);

      await evidence.insertStories(
        approved
          .filter((draft) => draft.kind === "story")
          .map((draft) => {
            const story = payloadOf(draft);
            return {
              ...owner,
              encryptedProblem: cipher.encrypt(story.problem ?? ""),
              encryptedAction: cipher.encrypt(story.action ?? ""),
              encryptedPartners: story.partners
                ? cipher.encrypt(story.partners)
                : null,
              encryptedResult: cipher.encrypt(story.result ?? ""),
              language: draft.language,
              evidenceIds: evidenceFromSameSource(draft),
              approvedAt,
            };
          })
      );

      // A skill joins an existing one of the same name, gaining this
      // session's evidence: a skill without evidence is not usable.
      const existingSkills = (await evidence.listSkills(profile.id)).map(
        (row) => ({
          ...row,
          name: cipher.decrypt(row.encryptedName),
        })
      );
      for (const draft of approved.filter((d) => d.kind === "skill")) {
        const name = (payloadOf(draft).text ?? "").trim();
        const evidenceIds = evidenceFromSameSource(draft);
        const existing = existingSkills.find(
          (skill) => skill.name.toLowerCase() === name.toLowerCase()
        );
        if (existing) {
          await evidence.updateSkillEvidence({
            skillId: existing.id,
            evidenceIds: [
              ...new Set([...existing.evidenceIds, ...evidenceIds]),
            ],
          });
        } else if (name) {
          await evidence.insertSkills([
            {
              profileId: profile.id,
              encryptedName: cipher.encrypt(name),
              evidenceIds,
            },
          ]);
        }
      }

      const flagged = await interview.listDraftSensitiveItems(session.id);
      await evidence.insertSensitiveItems(
        flagged.map((item) => ({
          profileId: profile.id,
          positionId: session.positionId,
          kind: item.kind,
          encryptedOriginal: item.encryptedOriginal,
          choice: defaultSensitivityChoice(item.kind),
          encryptedGeneralized: item.encryptedSuggestedGeneralization,
        }))
      );

      await interview.updateDrafts(
        approved.map((d) => d.id),
        { status: "approved" }
      );
      await interview.updateDrafts(
        discarded.map((d) => d.id),
        { status: "discarded" }
      );
      await interview.updateSession(session.id, {
        status: "closed",
        closedAt: approvedAt,
        extractionApprovedAt: approvedAt,
      });

      if (session.positionId && input.closePosition) {
        await career.updatePosition(session.positionId, {
          status: "approved",
          approvedAt,
        });
        await career.resolveCrossNotes(session.positionId);
        return { nextSessionId: null, summarize: true };
      }

      if (!input.closePosition) {
        const next = await interview.insertSession({
          profileId: profile.id,
          positionId: session.positionId,
          credentialId: session.credentialId,
          scriptKind: session.scriptKind,
          stage: session.stage,
        });
        return { nextSessionId: next.id, summarize: false };
      }
      return { nextSessionId: null, summarize: false };
    });

    if (result.summarize && session.positionId) {
      await this.tasks.start({
        userId: input.userId,
        type: "summarize_position",
        subjectId: session.positionId,
      });
    }
    return { nextSessionId: result.nextSessionId };
  }

  async listSensitiveItems(userId: string) {
    const profile = await this.requireProfile(userId);
    return this.db.transaction(async (tx) => {
      const cipher = await getUserCipher(tx, userId);
      const items = await new EvidenceRepository(tx).listSensitiveItems(
        profile.id
      );
      return items.map((item) => ({
        id: item.id,
        kind: item.kind,
        original: cipher.decrypt(item.encryptedOriginal),
        choice: item.choice,
        generalized: item.encryptedGeneralized
          ? cipher.decrypt(item.encryptedGeneralized)
          : null,
        reviewed: !!item.reviewedAt,
      }));
    });
  }

  async setSensitiveChoice(input: {
    userId: string;
    sensitiveItemId: string;
    choice: SensitivityChoice;
    generalized?: string;
  }) {
    if (input.choice === "generalize" && !input.generalized?.trim()) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const evidence = new EvidenceRepository(tx);
      const item = await evidence.findSensitiveItem({
        profileId: profile.id,
        sensitiveItemId: input.sensitiveItemId,
      });
      if (!item) throw notFound();
      const cipher = await getUserCipher(tx, input.userId);
      await evidence.updateSensitiveItem(item.id, {
        choice: input.choice,
        encryptedGeneralized:
          input.choice === "generalize" && input.generalized
            ? cipher.encrypt(input.generalized.trim())
            : item.encryptedGeneralized,
        reviewedAt: new Date(),
      });
    });
  }

  /**
   * The shortcut for imports (guided interview spec): every position whose
   * facts came only from files, with no conflict left, is approved with all
   * its extracted facts. Positions with conflicts wait for the user.
   */
  async approveImportedPositionsWithoutConflicts(userId: string) {
    const profile = await this.requireProfile(userId);
    const career = new CareerRepository(this.db);
    const interview = new InterviewRepository(this.db);
    const positions = (await career.listPositions(profile.id)).filter(
      (position) =>
        position.status === "pending" || position.status === "in_progress"
    );
    const conflicts = await career.listOpenConflicts(
      positions.map((p) => p.id)
    );
    const sessions = await interview.listSessions(profile.id);

    let approved = 0;
    for (const position of positions) {
      if (conflicts.some((conflict) => conflict.positionId === position.id))
        continue;
      const session = sessions.find(
        (candidate) =>
          candidate.positionId === position.id && candidate.status === "open"
      );
      if (!session) continue;
      const [turns, drafts] = await Promise.all([
        interview.listTurns(session.id),
        interview.listDrafts(session.id),
      ]);
      const pending = drafts.filter((draft) => draft.status === "draft");
      // Only file imports: a session the user talked in is reviewed by them.
      if (turns.length > 0 || pending.length === 0) continue;
      if (!pending.every((draft) => draft.sourceDocumentId)) continue;

      await this.approveExtraction({
        userId,
        sessionId: session.id,
        closePosition: true,
        decisions: pending.map((draft) => ({
          draftId: draft.id,
          approved: true,
        })),
      });
      approved++;
    }
    return { approved };
  }

  /** The open session of each target, for the timeline's "continue" action. */
  async listOpenSessions(userId: string) {
    // The profile may not exist yet on a new user's first load.
    const profile = await new CareerRepository(this.db).findProfileByUserId(
      userId
    );
    if (!profile) return [];
    const sessions = await new InterviewRepository(this.db).listSessions(
      profile.id
    );
    return sessions
      .filter((session) => session.status === "open")
      .map((session) => ({
        sessionId: session.id,
        positionId: session.positionId,
        credentialId: session.credentialId,
      }));
  }
}
