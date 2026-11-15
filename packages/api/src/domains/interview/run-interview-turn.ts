import { and, eq, isNull } from "drizzle-orm";

import type { AiClient } from "@repo/api/domains/ai/ai-client";
import { checkTopic } from "@repo/api/domains/ai/topic-gate";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { crossNotesTable } from "@repo/api/domains/career/db/career-tables";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { EvidenceRepository } from "@repo/api/domains/evidence/evidence-repository";
import type { DbClient } from "@repo/api/tools/db-client";
import type { MisuseGuard } from "@repo/api/tools/misuse-guard";

import {
  buildPositionPrompt,
  type PositionPromptInput,
  type PromptPosition,
} from "./context/build-position-prompt";
import { InterviewRepository } from "./interview-repository";
import { fixedReply } from "./fixed-replies";
import { estimateTokens, interviewSettings } from "./interview-settings";
import { createInterviewTools } from "./interview-tools";
import type { TurnKind } from "./schemas/interview";

type Deps = {
  db: DbClient;
  ai: AiClient;
  cipher: UserCipher;
  misuse: MisuseGuard;
  userId: string;
};

/**
 * One interview turn, inside its Trigger.dev task (ADR 0003). The user's
 * message passes the guardrails in order, and the first that fails answers
 * from code with no call to the main model: the misuse cooldown, then the
 * topic gate. Only then does the position agent run, with the current
 * session's turns and nothing from closed sessions.
 */
export async function runInterviewTurn(
  deps: Deps & { userTurnId: string }
): Promise<{ kind: TurnKind }> {
  const { db, ai, cipher } = deps;
  const interview = new InterviewRepository(db);

  const userTurn = await interview.findTurn(deps.userTurnId);
  const session =
    userTurn && (await interview.findSessionById(userTurn.sessionId));
  if (!userTurn?.encryptedContent || session?.status !== "open") {
    throw new Error(`Turn ${deps.userTurnId} has no open session`);
  }
  const message = cipher.decrypt(userTurn.encryptedContent);

  const turns = await interview.listTurns(session.id);
  const conversation = turns
    .filter((turn) => turn.kind === "text" && turn.encryptedContent)
    .map((turn) => ({
      id: turn.id,
      role: turn.role,
      content: cipher.decrypt(turn.encryptedContent!),
    }));
  const previousQuestion = conversation
    .filter((turn) => turn.role === "assistant")
    .at(-1)?.content;

  const reply = async (kind: TurnKind, content: string | null) => {
    await interview.insertTurn({
      sessionId: session.id,
      role: "assistant",
      kind,
      encryptedContent: content ? cipher.encrypt(content) : null,
      language: userTurn.language,
      tokenCount: content ? estimateTokens(content) : 0,
    });
    return { kind };
  };

  if (await deps.misuse.isCoolingDown(deps.userId)) {
    return reply("cooldown", fixedReply("cooldown", userTurn.language));
  }

  const verdict = await checkTopic({
    ai,
    context: "career_interview",
    message,
    previousQuestion,
  });
  if (verdict !== "on_topic") {
    await deps.misuse.recordBlocked(deps.userId);
    const kind = verdict === "override" ? "blocked_override" : "off_topic";
    return reply(kind, fixedReply(kind, userTurn.language));
  }

  const promptInput = await loadPromptInput({ db, cipher, session });
  const tools = createInterviewTools({
    db,
    cipher,
    profileId: session.profileId,
    sessionId: session.id,
    positionId: session.positionId,
    projectId: session.projectId,
    language: userTurn.language,
    userTurns: conversation
      .filter((turn) => turn.role === "user")
      .map(({ id, content }) => ({ id, content })),
    positionIds: promptInput.timeline.map((position) => position.id),
  });

  const { text, usages } = await ai.runAgent({
    purpose: "interview_turn",
    role: "writing",
    maxTokens: interviewSettings.agentMaxTokens,
    maxIterations: interviewSettings.agentMaxIterations,
    system: buildPositionPrompt(promptInput),
    messages: conversation.map(({ role, content }) => ({
      role,
      content:
        role === "user" ? `<user_message>${content}</user_message>` : content,
    })),
    tools,
  });

  await reply("text", text);
  await interview.addSessionTokens({
    sessionId: session.id,
    turnTokens: estimateTokens(message) + estimateTokens(text),
    inputTokens: usages.reduce((sum, usage) => sum + usage.inputTokens, 0),
    outputTokens: usages.reduce((sum, usage) => sum + usage.outputTokens, 0),
  });

  // Past the threshold the interviewer proposes a checkpoint (once).
  const updated = await interview.findSessionById(session.id);
  if (
    updated &&
    !updated.extractionProposedAt &&
    updated.turnTokens >= interviewSettings.checkpointTokens &&
    !turns.some((turn) => turn.kind === "checkpoint")
  ) {
    await reply("checkpoint", null);
  }

  return { kind: "text" };
}

async function loadPromptInput({
  db,
  cipher,
  session,
}: {
  db: DbClient;
  cipher: UserCipher;
  session: NonNullable<
    Awaited<ReturnType<InterviewRepository["findSessionById"]>>
  >;
}): Promise<PositionPromptInput> {
  const career = new CareerRepository(db);
  const evidence = new EvidenceRepository(db);
  const interview = new InterviewRepository(db);

  const [profileRows, positionRows, drafts] = await Promise.all([
    db.query.careerProfilesTable.findFirst({
      where: (profile, { eq: equals }) => equals(profile.id, session.profileId),
    }),
    career.listPositions(session.profileId),
    interview.listDrafts(session.id),
  ]);
  const language = profileRows?.interviewLanguage ?? "en-US";

  const timeline: PromptPosition[] = positionRows
    .filter((row) => row.status !== "removed")
    .sort(
      (a, b) =>
        (b.endDate ?? "9999-12").localeCompare(a.endDate ?? "9999-12") ||
        (b.startDate ?? "").localeCompare(a.startDate ?? "")
    )
    .map((row) => ({
      id: row.id,
      employer: cipher.decrypt(row.encryptedEmployer),
      title: cipher.decrypt(row.encryptedTitle),
      startDate: row.startDate,
      endDate: row.endDate,
      status: row.status,
    }));

  const draftFacts = drafts
    .filter((draft) => draft.status === "draft")
    .map((draft) => {
      const payload = JSON.parse(
        cipher.decrypt(draft.encryptedPayload)
      ) as Record<string, string>;
      return draft.kind === "story"
        ? `story: ${payload.problem} / ${payload.action} / ${payload.result}`
        : `${draft.kind}: ${payload.text}`;
    });

  const currentProject = session.projectId
    ? await db.query.projectsTable.findFirst({
        where: (project, { eq: equals }) =>
          equals(project.id, session.projectId!),
      })
    : undefined;

  const base = {
    language,
    scriptKind: session.scriptKind,
    stage: session.stage,
    timeline,
    draftFacts,
    currentProject: currentProject
      ? cipher.decrypt(currentProject.encryptedName)
      : null,
  };

  if (session.credentialId) {
    const credential = await career.findCredential({
      profileId: session.profileId,
      credentialId: session.credentialId,
    });
    const credentialEvidence = (await evidence.listEvidence(session.profileId))
      .filter((row) => row.credentialId === session.credentialId)
      .map((row) => `${row.kind}: ${cipher.decrypt(row.encryptedText)}`);
    return {
      ...base,
      target: {
        kind: "credential",
        title: credential ? cipher.decrypt(credential.encryptedTitle) : "",
        institution: credential?.encryptedInstitution
          ? cipher.decrypt(credential.encryptedInstitution)
          : null,
      },
      neighbourSummaries: [],
      knownFacts: credentialEvidence,
      notesFromOtherPositions: [],
    };
  }

  const index = timeline.findIndex(
    (position) => position.id === session.positionId
  );
  if (index < 0) {
    return {
      ...base,
      target: { kind: "no_positions" },
      neighbourSummaries: [],
      knownFacts: [],
      notesFromOtherPositions: [],
    };
  }

  // Summaries of the next (more recent) and previous positions only.
  const neighbours = [timeline[index - 1], timeline[index + 1]].filter(Boolean);
  const summaries = await career.latestSummaries(neighbours.map((n) => n.id));
  const positionRow = positionRows.find(
    (row) => row.id === session.positionId
  )!;

  const [knownEvidence, notes] = await Promise.all([
    evidence.listEvidenceForPosition(positionRow.id),
    db
      .select()
      .from(crossNotesTable)
      .where(
        and(
          eq(crossNotesTable.toPositionId, positionRow.id),
          isNull(crossNotesTable.resolvedAt)
        )
      ),
  ]);

  return {
    ...base,
    target: {
      kind: "position",
      position: timeline[index],
      location: positionRow.encryptedLocation
        ? cipher.decrypt(positionRow.encryptedLocation)
        : null,
    },
    neighbourSummaries: summaries.map((summary) => {
      const neighbour = neighbours.find((n) => n.id === summary.positionId)!;
      return {
        label: `${neighbour.title} at ${neighbour.employer}`,
        summary: cipher.decrypt(summary.encryptedSummary),
      };
    }),
    knownFacts: knownEvidence.map(
      (row) => `${row.kind}: ${cipher.decrypt(row.encryptedText)}`
    ),
    notesFromOtherPositions: notes.map((note) =>
      cipher.decrypt(note.encryptedText)
    ),
  };
}
