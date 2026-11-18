import { TRPCError } from "@trpc/server";
import {
  APICallError,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  type streamText as streamTextFn,
} from "ai";

import type { AiClient } from "@repo/api/domains/ai/ai-client";
import type { AiFunding } from "@repo/api/domains/ai/ai-funding";
import { AiUsageRepository } from "@repo/api/domains/ai/ai-usage-repository";
import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { anthropicModels } from "@repo/api/domains/ai/providers/anthropic-package";
import { KeyUnusableError } from "@repo/api/domains/ai/providers/provider-package";
import { checkTopic, type ChatContext } from "@repo/api/domains/ai/topic-gate";
import type { ProfileLanguage } from "@repo/api/domains/profile/truth/sections";
import { finishTask } from "@repo/api/domains/tasks/run-task";
import type { TaskType } from "@repo/api/domains/tasks/schemas/task";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";
import type { MisuseGuard } from "@repo/api/tools/misuse-guard";
import type { RateLimiter } from "@repo/api/tools/rate-limit";

import type { AgentChat } from "./agent-chat-repository";
import { agentSettings } from "./agent-settings";
import { lastText, startingWithUser } from "./chat-history";
import { fixedReply, type FixedReplyKind } from "./fixed-replies";
import { fixedReplyModel } from "./fixed-reply-model";

/** What the turn left open, for the agent to settle when it completes. */
export type OpenTurn = {
  taskId: string;
  userId: string;
  funding: AiFunding;
  model: string;
};

/** What every agent's turn needs from its task; tests pass fakes. */
export type AgentTurnDeps = {
  db: DbClient;
  misuse: MisuseGuard;
  rateLimiter: RateLimiter;
  streamText: typeof streamTextFn;
  // The agent's model instead of the turn's own (tests pass a mock).
  model?: (modelId: string) => LanguageModel;
};

export type FixedTurn = {
  kind: "fixed";
  result: ReturnType<typeof streamTextFn>;
  turn: OpenTurn | null;
};

export type ReadyTurn = {
  kind: "ready";
  // The user's message, trimmed.
  message: string;
  ai: AiClient;
  model: LanguageModel;
  modelId: string;
  turn: OpenTurn;
  /** Settles the reservation as failed: for what breaks before the stream. */
  fail: (error: unknown) => Promise<never>;
};

/**
 * The guardrails every agent's turn passes before its model is called
 * (AI platform spec): an empty or too-long message, the per-minute and
 * per-day limits, the credit reservation, the misuse cooldown and the topic
 * gate, each answered from code in the user's language when it blocks.
 * What comes back is either that fixed reply or everything the agent needs
 * to stream its own: the model, its funding and the open reservation.
 */
export async function guardAgentTurn(
  deps: AgentTurnDeps,
  input: {
    chat: AgentChat;
    taskType: TaskType;
    topic: ChatContext;
    messages: ModelMessage[];
    replyLanguage: ProfileLanguage;
  }
): Promise<FixedTurn | ReadyTurn> {
  const { db } = deps;
  const { chat } = input;
  const userId = chat.userId;
  const message = lastText(input.messages, "user")?.trim() ?? "";
  const fixed = (kind: FixedReplyKind, turn: OpenTurn | null = null) =>
    ({
      kind: "fixed",
      result: deps.streamText({
        model: fixedReplyModel(
          fixedReply(kind, input.replyLanguage, chat.subject)
        ),
        messages: startingWithUser(input.messages),
        // No spans here either: they would carry the conversation (ADR 0007).
        experimental_telemetry: { isEnabled: false },
      }),
      turn,
    }) satisfies FixedTurn;

  if (!message) return fixed("off_topic");
  if (message.length > agentSettings.maxMessageCharacters) {
    return fixed("too_long");
  }
  // Messages per minute and per day (AI platform spec, guardrail 7).
  const allowed = await Promise.all([
    deps.rateLimiter.allow("chatMessage", userId),
    deps.rateLimiter.allow("chatMessagesPerDay", userId),
  ]);
  if (allowed.includes(false)) return fixed("too_many");

  let task;
  try {
    task = await new TasksService(db).reserve({
      userId,
      type: input.taskType,
      subjectId: chat.id,
    });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "PAYMENT_REQUIRED") {
      return fixed("out_of_credits");
    }
    throw error;
  }

  // From here the reservation is open: anything that fails before the
  // stream exists settles it as failed (and marks a dead key).
  const fail = async (error: unknown): Promise<never> => {
    const owner = await new TasksRepository(db).findOwner(task.id);
    await finishTask({
      db,
      taskId: task.id,
      userId,
      funding: owner?.funding ?? "credits",
      error,
    });
    throw error;
  };
  try {
    const { ai, funding, languageModel } = await createTaskAi({
      db,
      userId,
      taskId: task.id,
      applyCommunicationRules: false,
    });
    const modelId = anthropicModels.writing;
    const turn: OpenTurn = { taskId: task.id, userId, funding, model: modelId };

    if (await deps.misuse.isCoolingDown(userId)) return fixed("cooldown", turn);
    const verdict = await checkTopic({
      ai,
      context: input.topic,
      message,
      previousQuestion: lastText(input.messages, "assistant"),
    });
    if (verdict !== "on_topic") {
      await deps.misuse.recordBlocked(userId);
      return fixed(
        verdict === "override" ? "blocked_override" : "off_topic",
        turn
      );
    }
    return {
      kind: "ready",
      message,
      ai,
      model: (deps.model ?? languageModel)(modelId),
      modelId,
      turn,
      fail,
    };
  } catch (error) {
    return fail(error);
  }
}

/** A provider refusal of the user's own key, as the task ledger knows it. */
export function keyFailure(error: unknown) {
  if (!APICallError.isInstance(error)) return error;
  if (error.statusCode === 401 || error.statusCode === 403) {
    return new KeyUnusableError("refused");
  }
  if (/credit balance|billing/i.test(error.responseBody ?? "")) {
    return new KeyUnusableError("out_of_credit");
  }
  return error;
}

/**
 * Settles a completed turn: its usage is recorded under the agent's
 * purpose and the reservation is settled whatever happens to the usage
 * record. A provider error mid-stream ends the turn without throwing.
 */
export async function settleAgentTurn(input: {
  db: DbClient;
  turn: OpenTurn;
  purpose: string;
  usage?: LanguageModelUsage;
  error?: unknown;
  finishReason?: string;
}) {
  const { db, turn } = input;
  try {
    if (input.usage) {
      await new AiUsageRepository(db).record({
        userId: turn.userId,
        taskId: turn.taskId,
        purpose: input.purpose,
        funding: turn.funding,
        provider: "anthropic",
        role: "writing",
        model: turn.model,
        inputTokens: input.usage.inputTokens ?? 0,
        outputTokens: input.usage.outputTokens ?? 0,
        cacheReadTokens: input.usage.inputTokenDetails?.cacheReadTokens ?? 0,
        cacheWriteTokens: input.usage.inputTokenDetails?.cacheWriteTokens ?? 0,
      });
    }
  } finally {
    await finishTask({
      db,
      taskId: turn.taskId,
      userId: turn.userId,
      funding: turn.funding,
      error:
        input.error !== undefined
          ? keyFailure(input.error)
          : input.finishReason === "error"
            ? new Error("The turn ended with a stream error")
            : undefined,
    });
  }
}
