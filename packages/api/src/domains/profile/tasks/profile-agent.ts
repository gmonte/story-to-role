import { chat } from "@trigger.dev/sdk/ai";
import { z } from "zod";

import { createAgentTranscriptStorage } from "@repo/api/domains/agents/agent-transcript-storage";
import {
  settleAgentTurn,
  type OpenTurn,
} from "@repo/api/domains/agents/agent-turn";
import { startingWithUser } from "@repo/api/domains/agents/chat-history";
import { fixedReplyModel } from "@repo/api/domains/agents/fixed-reply-model";
import { db } from "@repo/api/tools/db";
import { redisMisuseGuard } from "@repo/api/tools/misuse-guard";
import { upstashRateLimiter } from "@repo/api/tools/rate-limit";

import {
  markImportSummariesSaid,
  pendingImportSummaries,
} from "../agent/import-summaries";
import { runAgentTurn } from "../agent/run-agent-turn";

// The turn each chat has open in this run, settled when it completes.
const openTurns = new Map<string, OpenTurn>();
// What each chat says on its next action turn: the summaries of the
// imports that finished since it last spoke.
const summaries = new Map<
  string,
  { sourceDocumentIds: string[]; text: string; said?: boolean }
>();

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
        reportReviewResolved: () =>
          chat.response.write({
            type: "data-review-resolved",
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
    await settleAgentTurn({
      db,
      turn,
      purpose: "profile_agent",
      usage,
      error,
      finishReason,
    });
  },
});
