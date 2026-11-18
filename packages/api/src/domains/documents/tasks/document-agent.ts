import { chat } from "@trigger.dev/sdk/ai";

import { createAgentTranscriptStorage } from "@repo/api/domains/agents/agent-transcript-storage";
import {
  settleAgentTurn,
  type OpenTurn,
} from "@repo/api/domains/agents/agent-turn";
import { db } from "@repo/api/tools/db";
import { redisMisuseGuard } from "@repo/api/tools/misuse-guard";
import { upstashRateLimiter } from "@repo/api/tools/rate-limit";

import { runDocumentAgentTurn } from "../agent/run-document-agent-turn";

// The turn each chat has open in this run, settled when it completes.
const openTurns = new Map<string, OpenTurn>();

/**
 * A document agent (ADR 0009): one durable run per conversation about one
 * resume or cover letter, on the profile agent's plumbing. The transcript
 * lives in our tables, encrypted; the run trace records no message or
 * client data.
 */
export const documentAgent = chat.agent({
  id: "document_agent",
  idleTimeoutInSeconds: 300,
  telemetry: { recordUserMessage: false, recordClientData: false },
  storage: createAgentTranscriptStorage(db),
  uiMessageStreamOptions: {
    // Never the provider's message: it may quote the prompt.
    onError: () =>
      "Something went wrong with this answer. Please send it again.",
  },
  run: async ({ chatId, messages, signal, streamText }) => {
    const { result, turn } = await runDocumentAgentTurn(
      {
        db,
        misuse: redisMisuseGuard,
        rateLimiter: upstashRateLimiter,
        streamText,
        reportChange: (documentChangeId) =>
          chat.response.write({
            type: "data-change",
            id: documentChangeId,
            data: {},
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
    await settleAgentTurn({
      db,
      turn,
      purpose: "document_agent",
      usage,
      error,
      finishReason,
    });
  },
});
