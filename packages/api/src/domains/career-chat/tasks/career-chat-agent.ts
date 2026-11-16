import { chat } from "@trigger.dev/sdk/ai";
import { APICallError, type LanguageModelUsage } from "ai";

import { AiUsageRepository } from "@repo/api/domains/ai/ai-usage-repository";
import { KeyUnusableError } from "@repo/api/domains/ai/providers/provider-package";
import { finishTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";
import { redisMisuseGuard } from "@repo/api/tools/misuse-guard";

import { createCareerTranscriptStorage } from "../career-transcript-storage";
import { runCareerChatTurn, type OpenTurn } from "../run-career-chat-turn";

// The turn each chat has open in this run, settled when it completes.
const openTurns = new Map<string, OpenTurn>();

/** A provider refusal of the user's own key, as the task ledger knows it. */
function keyFailure(error: unknown) {
  if (!APICallError.isInstance(error)) return error;
  if (error.statusCode === 401 || error.statusCode === 403) {
    return new KeyUnusableError("refused");
  }
  if (/credit balance|billing/i.test(error.responseBody ?? "")) {
    return new KeyUnusableError("out_of_credit");
  }
  return error;
}

async function recordUsage(turn: OpenTurn, usage: LanguageModelUsage) {
  await new AiUsageRepository(db).record({
    userId: turn.userId,
    taskId: turn.taskId,
    purpose: "career_chat",
    funding: turn.funding,
    provider: "anthropic",
    role: "writing",
    model: turn.model,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? 0,
  });
}

/**
 * The career chat (ADR 0007): one durable run per conversation that streams
 * the orchestrator's reply. The transcript lives in our tables, encrypted;
 * the run trace records no message or client data.
 */
export const careerChatAgent = chat.agent({
  id: "career_chat",
  idleTimeoutInSeconds: 300,
  telemetry: { recordUserMessage: false, recordClientData: false },
  storage: createCareerTranscriptStorage(db),
  uiMessageStreamOptions: {
    // Never the provider's message: it may quote the prompt.
    onError: () =>
      "Something went wrong with this answer. Please send it again.",
  },
  run: async ({ chatId, messages, signal, streamText }) => {
    const { result, turn } = await runCareerChatTurn(
      {
        db,
        misuse: redisMisuseGuard,
        streamText,
        reportAgents: (working) =>
          chat.response.write({
            type: "data-agents",
            id: "agents",
            data: { working },
            transient: true,
          }),
      },
      { chatId, messages, signal }
    );
    if (turn) openTurns.set(chatId, turn);
    return result;
  },
  onTurnComplete: async ({ chatId, usage, error, finishReason }) => {
    const turn = openTurns.get(chatId);
    if (!turn) return;
    openTurns.delete(chatId);
    try {
      if (usage) await recordUsage(turn, usage);
    } finally {
      // Settled whatever happens to the usage record.
      await finishTask({
        db,
        taskId: turn.taskId,
        userId: turn.userId,
        funding: turn.funding,
        // A provider error mid-stream ends the turn without throwing.
        error:
          error !== undefined
            ? keyFailure(error)
            : finishReason === "error"
              ? new Error("The turn ended with a stream error")
              : undefined,
      });
    }
  },
});
