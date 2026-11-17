import { chat } from "@trigger.dev/sdk/ai";
import { APICallError, type LanguageModelUsage } from "ai";
import { z } from "zod";

import { AiUsageRepository } from "@repo/api/domains/ai/ai-usage-repository";
import { KeyUnusableError } from "@repo/api/domains/ai/providers/provider-package";
import { finishTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";
import { redisMisuseGuard } from "@repo/api/tools/misuse-guard";
import { upstashRateLimiter } from "@repo/api/tools/rate-limit";

import { createAgentTranscriptStorage } from "../agent/agent-transcript-storage";
import { startingWithUser } from "../agent/chat-history";
import { fixedReplyModel } from "../agent/fixed-reply-model";
import {
  markImportSummariesSaid,
  pendingImportSummaries,
} from "../agent/import-summaries";
import { runAgentTurn, type OpenTurn } from "../agent/run-agent-turn";

// The turn each chat has open in this run, settled when it completes.
const openTurns = new Map<string, OpenTurn>();
// What each chat says on its next action turn: the summaries of the
// imports that finished since it last spoke.
const summaries = new Map<
  string,
  { sourceDocumentIds: string[]; text: string; said?: boolean }
>();

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
    purpose: "profile_agent",
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
 * The profile agent (ADR 0007): one durable run per conversation that
 * streams the agent's reply. The transcript lives in our tables, encrypted;
 * the run trace records no message or client data.
 */
export const profileAgent = chat.agent({
  id: "profile_agent",
  idleTimeoutInSeconds: 300,
  telemetry: { recordUserMessage: false, recordClientData: false },
  storage: createAgentTranscriptStorage(db),
  uiMessageStreamOptions: {
    // Never the provider's message: it may quote the prompt.
    onError: () =>
      "Something went wrong with this answer. Please send it again.",
  },
  // The page asks when it sees an import whose summary the chat hasn't
  // said yet, also when it finished while the page was away.
  actionSchema: z.object({ type: z.literal("catch_up") }),
  onAction: async ({ chatId }) => {
    const pending = await pendingImportSummaries(db, chatId);
    if (!pending) return;
    summaries.set(chatId, pending);
    return chat.turn();
  },
  run: async ({ chatId, messages, signal, streamText, trigger }) => {
    const summary = summaries.get(chatId);
    if (trigger === "action-turn" && summary) {
      summary.said = true;
      // The import wrote it (its cost); saying it is free. The chat may be
      // empty yet: the stream wants a prompt to answer.
      return streamText({
        model: fixedReplyModel(summary.text),
        messages: startingWithUser(messages),
        experimental_telemetry: { isEnabled: false },
      });
    }
    const { result, turn } = await runAgentTurn(
      {
        db,
        misuse: redisMisuseGuard,
        rateLimiter: upstashRateLimiter,
        streamText,
        reportSuggestion: (profileSuggestionId) =>
          chat.response.write({
            type: "data-suggestion",
            id: profileSuggestionId,
            data: {},
            transient: true,
          }),
      },
      { chatId, messages, signal }
    );
    if (turn) openTurns.set(chatId, turn);
    return result;
  },
  onTurnComplete: async ({ chatId, usage, error, finishReason, stopped }) => {
    // A summary counts as said once its turn completed cleanly (a stop
    // counts too: the user doesn't want it said again); otherwise it waits
    // for the next ask.
    const summary = summaries.get(chatId);
    if (summary?.said) {
      summaries.delete(chatId);
      if (error === undefined && (finishReason === "stop" || stopped)) {
        await markImportSummariesSaid(db, summary.sourceDocumentIds);
      }
    }
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
