import { TRPCError } from "@trpc/server";
import {
  stepCountIs,
  tool,
  type LanguageModel,
  type ModelMessage,
  type streamText as streamTextFn,
} from "ai";
import { z } from "zod";

import type { AiFunding } from "@repo/api/domains/ai/ai-funding";
import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { anthropicModels } from "@repo/api/domains/ai/providers/anthropic-package";
import { checkTopic } from "@repo/api/domains/ai/topic-gate";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { detectLanguage } from "@repo/api/domains/career/detect-language";
import type { InterviewLanguage } from "@repo/api/domains/career/schemas/career";
import { fixedReply } from "@repo/api/domains/interview/fixed-replies";
import { interviewSettings } from "@repo/api/domains/interview/interview-settings";
import { InterviewService } from "@repo/api/domains/interview/interview-service";
import { runInterviewTurn } from "@repo/api/domains/interview/run-interview-turn";
import { finishTask } from "@repo/api/domains/tasks/run-task";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";
import type { MisuseGuard } from "@repo/api/tools/misuse-guard";

import { CareerChatRepository } from "./career-chat-repository";
import { markCareerChangesSeen, unseenCareerChanges } from "./career-changes";
import { lastText, startingWithUser, withoutReasoning } from "./chat-history";
import { buildCareerChatPrompt, type ChatTarget } from "./career-chat-prompt";
import { careerAgentLabel } from "./career-agent-label";
import { careerChatSettings } from "./career-chat-settings";
import { fixedReplyModel } from "./fixed-reply-model";

/** What the turn left open, for the agent to settle when it completes. */
export type OpenTurn = {
  taskId: string;
  userId: string;
  funding: AiFunding;
  model: string;
};

export type CareerTurnDeps = {
  db: DbClient;
  misuse: MisuseGuard;
  streamText: typeof streamTextFn;
  // The orchestrator's model instead of the turn's own (tests pass a mock).
  model?: (modelId: string) => LanguageModel;
  // Which interviewers are working right now, for the chat's live status.
  reportAgents: (working: string[]) => void;
};

const outOfCredits: Record<InterviewLanguage, string> = {
  "en-US":
    "You're out of credits for the interview right now. Subscribe for monthly credits or buy a pack, then come back to this message.",
  "pt-BR":
    "Seus créditos para a entrevista acabaram por agora. Assine para ter créditos todo mês ou compre um pacote, e volte a esta mensagem.",
};

/**
 * One message of the career chat. The chat id leads to the profile and its
 * user, never anything the browser sends. Credits are reserved for the
 * turn, the guardrails answer from code when they block, and otherwise the
 * orchestrator streams its reply, handing the message to each position's
 * interviewer it concerns (in parallel when it covers several).
 */
export async function runCareerChatTurn(
  deps: CareerTurnDeps,
  input: { chatId: string; messages: ModelMessage[]; signal?: AbortSignal }
) {
  const { db } = deps;
  const chat = await new CareerChatRepository(db).findChat(input.chatId);
  const profile =
    chat && (await new CareerRepository(db).findProfileById(chat.profileId));
  if (!chat || !profile) throw new Error("Unknown career chat");
  const userId = profile.userId;
  const message = lastText(input.messages, "user")?.trim() ?? "";
  // The conversation follows the user's language; the facts stay in the
  // career's.
  const language = profile.interviewLanguage;
  const replyLanguage = detectLanguage(message) ?? language;

  const fixed = (text: string) => ({
    result: deps.streamText({
      model: fixedReplyModel(text),
      messages: input.messages,
    }),
    turn: null as OpenTurn | null,
  });

  if (!message || message.length > interviewSettings.maxMessageCharacters) {
    return fixed(fixedReply("off_topic", replyLanguage));
  }

  let task;
  try {
    task = await new TasksService(db).reserve({
      userId,
      type: "career_chat_turn",
      subjectId: chat.id,
    });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "PAYMENT_REQUIRED") {
      return fixed(outOfCredits[replyLanguage]);
    }
    throw error;
  }

  // From here the reservation is open: anything that fails before the
  // stream exists settles it as failed (and marks a dead key).
  try {
    return await orchestrate(deps, {
      chatId: chat.id,
      profileId: profile.id,
      userId,
      language,
      message,
      messages: input.messages,
      signal: input.signal,
      taskId: task.id,
      fixed,
    });
  } catch (error) {
    const owner = await new TasksRepository(db).findOwner(task.id);
    await finishTask({
      db,
      taskId: task.id,
      userId,
      funding: owner?.funding ?? "credits",
      error,
    });
    throw error;
  }
}

async function orchestrate(
  deps: CareerTurnDeps,
  input: {
    chatId: string;
    profileId: string;
    userId: string;
    language: InterviewLanguage;
    message: string;
    messages: ModelMessage[];
    signal?: AbortSignal;
    taskId: string;
    fixed: (text: string) => {
      result: ReturnType<typeof streamTextFn>;
      turn: OpenTurn | null;
    };
  }
) {
  const { db, misuse } = deps;
  const { userId, language, message } = input;
  const { ai, cipher, funding, languageModel, sensitiveFilter } =
    await createTaskAi({ db, userId, taskId: input.taskId });
  const modelId = anthropicModels.writing;
  const turn: OpenTurn = {
    taskId: input.taskId,
    userId,
    funding,
    model: modelId,
  };

  if (await misuse.isCoolingDown(userId)) {
    return { ...input.fixed(fixedReply("cooldown", language)), turn };
  }
  const verdict = await checkTopic({
    ai,
    context: "career_interview",
    message,
    previousQuestion: lastText(input.messages, "assistant"),
  });
  if (verdict !== "on_topic") {
    await misuse.recordBlocked(userId);
    const kind = verdict === "override" ? "blocked_override" : "off_topic";
    return { ...input.fixed(fixedReply(kind, language)), turn };
  }

  const career = new CareerRepository(db);
  const [positions, credentials] = await Promise.all([
    career.listPositions(input.profileId),
    career.listCredentials(input.profileId),
  ]);
  const targets: ChatTarget[] = [
    ...positions
      .filter((position) => position.status !== "removed")
      .map((position) => ({
        kind: "position" as const,
        id: position.id,
        title: cipher.decrypt(position.encryptedTitle),
        employer: cipher.decrypt(position.encryptedEmployer),
        startDate: position.startDate,
        endDate: position.endDate,
        status: position.status,
      })),
    ...credentials
      .filter((credential) => credential.status !== "do_not_use")
      .map((credential) => ({
        kind: "credential" as const,
        id: credential.id,
        title: cipher.decrypt(credential.encryptedTitle),
        credentialKind: credential.kind,
      })),
  ];

  const working = new Set<string>();
  let consulted = 0;
  const interview = new InterviewService(db);
  const consult = tool({
    description:
      "Hand the user's latest message to the interviewer of one position or credential (or the no-position interviewer) and get back its reply. Call it once per target the message concerns.",
    inputSchema: z.object({
      kind: z.enum(["position", "credential", "no_position"]),
      targetId: z
        .string()
        .optional()
        .describe("The position or credential id, exactly as listed"),
    }),
    execute: async ({ kind, targetId }) => {
      const target =
        kind === "no_position"
          ? null
          : targets.find(
              (candidate) =>
                candidate.kind === kind && candidate.id === targetId
            );
      if (kind !== "no_position" && !target) {
        return { error: "No such target; use an id from the list." };
      }
      if (++consulted > careerChatSettings.maxConsultsPerTurn) {
        return {
          error:
            "Two interviewers per message: tell the user you will get to this one with their next message.",
        };
      }
      const label = target ? labelOf(target) : careerAgentLabel;
      working.add(label);
      deps.reportAgents([...working]);
      try {
        const { sessionId } = await interview.openSession({
          userId,
          positionId: target?.kind === "position" ? target.id : undefined,
          credentialId: target?.kind === "credential" ? target.id : undefined,
        });
        // The user's own words, verbatim: the interviewer's facts must quote
        // them.
        const userTurn = await interview.addUserTurn({
          userId,
          sessionId,
          message,
          via: "career_chat",
        });
        if (!userTurn) return { reviewRequired: true };
        const reply = await runInterviewTurn({
          db,
          ai,
          cipher,
          misuse,
          userId,
          userTurnId: userTurn.id,
          gated: false,
        });
        return { reply: reply.text, reviewSuggested: reply.checkpoint };
      } finally {
        working.delete(label);
        deps.reportAgents([...working]);
      }
    },
  });

  // What the user changed on the side panel since the chat last saw it.
  const changes = await unseenCareerChanges(db, {
    profileId: input.profileId,
    userId,
  });
  await markCareerChangesSeen(db, changes.careerEventIds);
  const system = buildCareerChatPrompt({
    language,
    targets,
    changes: changes.summaries,
  });
  return {
    result: deps.streamText({
      model: (deps.model ?? languageModel)(modelId),
      // The user's sensitivity choices apply to the timeline it sees.
      system: sensitiveFilter ? sensitiveFilter.apply(system) : system,
      messages: startingWithUser(
        withoutReasoning(
          input.messages.slice(-careerChatSettings.historyWindow)
        )
      ),
      tools: { consult_interviewer: consult },
      stopWhen: stepCountIs(careerChatSettings.maxSteps),
      abortSignal: input.signal,
      // No spans: they would carry the timeline and the interviewers'
      // replies into the run trace (ADR 0007).
      experimental_telemetry: { isEnabled: false },
    }),
    turn,
  };
}

const labelOf = (target: ChatTarget) =>
  target.kind === "position"
    ? `${target.title} · ${target.employer}`
    : target.title;
