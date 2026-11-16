import { chat } from "@trigger.dev/sdk/ai";
import { APICallError, type LanguageModelUsage } from "ai";
import { z } from "zod";

import type { AiFunding } from "@repo/api/domains/ai/ai-funding";
import { AiUsageRepository } from "@repo/api/domains/ai/ai-usage-repository";
import { KeyUnusableError } from "@repo/api/domains/ai/providers/provider-package";
import { finishTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";
import { redisMisuseGuard } from "@repo/api/tools/misuse-guard";

import { createCareerTranscriptStorage } from "../career-transcript-storage";
import { fixedReplyModel } from "../fixed-reply-model";
import {
  markImportReactionsSaid,
  pendingImportReactions,
} from "../import-reactions";
import {
  markCareerChangesSeen,
  pendingCareerChanges,
  reactToCareerChanges,
  recordChangesReactionUsage,
  type PendingCareerChanges,
} from "../career-changes";
import { startingWithUser } from "../chat-history";
import { runCareerChatTurn, type OpenTurn } from "../run-career-chat-turn";

// The turn each chat has open in this run, settled when it completes.
const openTurns = new Map<string, OpenTurn>();
// What each chat says on its next action turn to catch up with the user:
// a finished import's reaction, or its word on changes from the side panel.
type CatchUp =
  | { kind: "import"; sourceDocumentIds: string[]; text: string }
  | {
      kind: "changes";
      pending: PendingCareerChanges;
      used?: { funding: AiFunding; modelId: string };
    };
const catchUps = new Map<string, CatchUp & { said?: boolean }>();

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
  // The page asks when it sees something the chat hasn't said yet (an
  // import ended, the user changed their career on the side panel), also
  // when that happened while it was away. One thing per ask: the page asks
  // again while anything is left.
  actionSchema: z.object({ type: z.literal("catch_up") }),
  onAction: async ({ chatId }) => {
    const reactions = await pendingImportReactions(db, chatId);
    if (reactions) {
      catchUps.set(chatId, { kind: "import", ...reactions });
      return chat.turn();
    }
    const pending = await pendingCareerChanges(db, chatId);
    if (pending) {
      catchUps.set(chatId, { kind: "changes", pending });
      return chat.turn();
    }
  },
  run: async ({ chatId, messages, signal, streamText, trigger }) => {
    const catchUp = catchUps.get(chatId);
    if (trigger === "action-turn" && catchUp?.kind === "import") {
      catchUp.said = true;
      // Marks the message: the page offers the import's shortcuts under it.
      chat.response.write({
        type: "data-import-review",
        id: "import-review",
        data: {},
      });
      // The import wrote it (its cost); saying it is free. The chat may be
      // empty yet: the stream wants a prompt to answer.
      return streamText({
        model: fixedReplyModel(catchUp.text),
        messages: startingWithUser(messages),
      });
    }
    if (trigger === "action-turn" && catchUp?.kind === "changes") {
      catchUp.said = true;
      const { result, funding, modelId } = await reactToCareerChanges(
        { db, streamText },
        { pending: catchUp.pending, messages }
      );
      catchUp.used = { funding, modelId };
      return result;
    }
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
    // What the chat caught up on counts as said once its turn completed
    // cleanly; otherwise it waits for the next ask.
    const catchUp = catchUps.get(chatId);
    if (catchUp?.said) {
      catchUps.delete(chatId);
      // Only an answer that finished: a provider error may end the stream
      // with no error raised.
      const clean = error === undefined && finishReason === "stop";
      if (catchUp.kind === "import" && clean) {
        await markImportReactionsSaid(db, catchUp.sourceDocumentIds);
      }
      if (catchUp.kind === "changes") {
        if (clean) {
          await markCareerChangesSeen(db, catchUp.pending.careerEventIds);
        }
        // Not charged; recorded, on the user's key or ours.
        if (usage && catchUp.used) {
          await recordChangesReactionUsage(db, {
            userId: catchUp.pending.userId,
            ...catchUp.used,
            usage,
          });
        }
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
