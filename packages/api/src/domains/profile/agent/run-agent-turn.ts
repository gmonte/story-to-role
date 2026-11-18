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
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { finishTask } from "@repo/api/domains/tasks/run-task";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";
import type { MisuseGuard } from "@repo/api/tools/misuse-guard";
import type { RateLimiter } from "@repo/api/tools/rate-limit";
import { findQuote } from "@repo/api/utils/text/verify-quote";

import { ProfileRepository } from "../profile-repository";
import { ProfileService } from "../profile-service";
import {
  proposeSuggestion,
  readSuggestionContent,
  type SuggestionRefusal,
} from "../suggestions/propose-suggestion";
import { parseBlocks, type ProfileBlock } from "../truth/blocks";
import { extractProfile } from "../truth/extract";
import { readStructure } from "../truth/structure";
import { listParts, partText, type ProfilePart } from "../truth/suggestions";
import { AgentChatRepository } from "./agent-chat-repository";
import { splitAgentMessage } from "./agent-message";
import { buildAgentPrompt } from "./agent-prompt";
import { agentSettings } from "./agent-settings";
import { lastText, startingWithUser, withoutReasoning } from "./chat-history";
import { detectLanguage } from "./detect-language";
import { fixedReply } from "./fixed-replies";
import { fixedReplyModel } from "./fixed-reply-model";
import { limitQuestions } from "./question-limit";

/** What the turn left open, for the agent to settle when it completes. */
export type OpenTurn = {
  taskId: string;
  userId: string;
  funding: AiFunding;
  model: string;
};

export type AgentTurnDeps = {
  db: DbClient;
  misuse: MisuseGuard;
  rateLimiter: RateLimiter;
  streamText: typeof streamTextFn;
  // The agent's model instead of the turn's own (tests pass a mock).
  model?: (modelId: string) => LanguageModel;
  // A suggestion was just proposed: the page shows it in the text at once.
  reportSuggestion: (profileSuggestionId: string) => void;
  // A review note was just resolved: the page refreshes the draft's keys.
  reportReviewResolved?: () => void;
};

// How many rejected suggestions the agent is reminded of.
const rememberedRejections = 5;

/** Why a suggestion was refused, for the model to do better. */
function refusalText(refusal: SuggestionRefusal) {
  switch (refusal.kind) {
    case "empty":
      return "Nothing to change: give the lines to replace, the new lines, or both.";
    case "notFound":
      return "Those lines aren't in that part exactly once as written (or what you add is already there). Read the part with read_part and copy the lines exactly, with a neighbouring line when they repeat; leave `find` empty to add at its end.";
    case "unchanged":
      return "The new lines are the same as the ones they replace.";
    case "ungivenFigures":
      return `Refused: the person never wrote ${refusal.figures.join(", ")}. Write the figure exactly as they did, or ask them for it; never supply a number yourself.`;
  }
}

/** Every user message of the conversation: the words figures may come from. */
function userWords(messages: ModelMessage[]) {
  return messages.flatMap((message) =>
    message.role !== "user"
      ? []
      : typeof message.content === "string"
        ? [message.content]
        : message.content.flatMap((part) =>
            part.type === "text" ? [part.text] : []
          )
  );
}

/**
 * The passage the conversation is about: the latest one the user quoted,
 * so follow-up answers keep it until they select another. Its part is the
 * one the message names when the passage is still there; otherwise the
 * only part that holds it (the same line may be in several experiences,
 * and then none is sure).
 */
function quotedPassage(
  blocks: ProfileBlock[],
  parts: ProfilePart[],
  messages: ModelMessage[]
) {
  const quoted = userWords(messages)
    .map(splitAgentMessage)
    .findLast((message) => message.quote);
  if (!quoted?.quote) return null;
  const firstLine = quoted.quote.split("\n")[0];
  const holding = parts.filter((part) => {
    const text = partText(blocks, part.key);
    return text && findQuote(text, firstLine);
  });
  const part =
    holding.find((candidate) => candidate.key === quoted.part) ??
    (holding.length === 1 ? holding[0] : null);
  return {
    text: quoted.quote,
    part,
    partText: part && partText(blocks, part.key),
  };
}

/**
 * The last `size` messages, starting at a user message: a window that
 * opened on a tool result would leave it without its call.
 */
function historyWindow(messages: ModelMessage[], size: number) {
  const window = messages.slice(-size);
  const firstUser = window.findIndex((message) => message.role === "user");
  return firstUser > 0 ? window.slice(firstUser) : window;
}

/**
 * One message to the profile agent (profile spec, "The agent"). The chat
 * id leads to its user, never anything the browser sends. Credits are
 * reserved for the turn, the guardrails answer from code when they block,
 * and otherwise the agent streams its reply with this turn's context: the
 * quoted passage and its part, the index, the gaps and the rules. It reads
 * other parts and proposes changes through tools; it changes nothing.
 */
export async function runAgentTurn(
  deps: AgentTurnDeps,
  input: { chatId: string; messages: ModelMessage[]; signal?: AbortSignal }
) {
  const { db } = deps;
  const chat = await new AgentChatRepository(db).findChat(input.chatId);
  if (!chat) throw new Error("Unknown profile chat");
  const userId = chat.userId;
  const document = await new ProfileRepository(db).findDocument(
    userId,
    "profile"
  );
  // The editor saves the profile (even the untouched template) before the
  // first message.
  if (!document) throw new Error("The profile has no draft yet");
  const cipher = await getUserCipher(db, userId);
  const blocks = parseBlocks(cipher.decrypt(document.encryptedDraft));

  const message = lastText(input.messages, "user")?.trim() ?? "";
  // Fixed replies follow the user's message; the profile's language decides
  // when the message doesn't say.
  const replyLanguage =
    detectLanguage(splitAgentMessage(message).text) ??
    readStructure(blocks).language;
  const fixed = (text: string) => ({
    result: deps.streamText({
      model: fixedReplyModel(text),
      messages: startingWithUser(input.messages),
      // No spans here either: they would carry the conversation (ADR 0007).
      experimental_telemetry: { isEnabled: false },
    }),
    turn: null as OpenTurn | null,
  });

  if (!message) return fixed(fixedReply("off_topic", replyLanguage));
  if (message.length > agentSettings.maxMessageCharacters) {
    return fixed(fixedReply("too_long", replyLanguage));
  }
  // Messages per minute and per day (AI platform spec, guardrail 7).
  const allowed = await Promise.all([
    deps.rateLimiter.allow("chatMessage", userId),
    deps.rateLimiter.allow("chatMessagesPerDay", userId),
  ]);
  if (allowed.includes(false)) {
    return fixed(fixedReply("too_many", replyLanguage));
  }

  let task;
  try {
    task = await new TasksService(db).reserve({
      userId,
      type: "profile_agent_turn",
      subjectId: chat.id,
    });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "PAYMENT_REQUIRED") {
      return fixed(fixedReply("out_of_credits", replyLanguage));
    }
    throw error;
  }

  // From here the reservation is open: anything that fails before the
  // stream exists settles it as failed (and marks a dead key).
  try {
    const { ai, funding, languageModel } = await createTaskAi({
      db,
      userId,
      taskId: task.id,
      applyCommunicationRules: false,
    });
    const modelId = anthropicModels.writing;
    const turn: OpenTurn = { taskId: task.id, userId, funding, model: modelId };

    if (await deps.misuse.isCoolingDown(userId)) {
      return { ...fixed(fixedReply("cooldown", replyLanguage)), turn };
    }
    const verdict = await checkTopic({
      ai,
      context: "profile",
      message,
      previousQuestion: lastText(input.messages, "assistant"),
    });
    if (verdict !== "on_topic") {
      await deps.misuse.recordBlocked(userId);
      const kind = verdict === "override" ? "blocked_override" : "off_topic";
      return { ...fixed(fixedReply(kind, replyLanguage)), turn };
    }

    const repository = new ProfileRepository(db);
    const pending = (await repository.listPendingSuggestions(document.id)).map(
      (row) => ({ id: row.id, ...readSuggestionContent(cipher, row) })
    );
    const rejected = (
      await repository.listRejectedSuggestions(
        document.id,
        rememberedRejections
      )
    ).map((row) => readSuggestionContent(cipher, row));

    const profileService = new ProfileService(db);
    const reviewNotes = await profileService.unresolvedReviewNotes(userId);
    const parts = listParts(blocks);
    const extract = extractProfile(blocks);
    const sources = userWords(input.messages);
    // What waits for the user, this turn's suggestions included: a newer
    // one on the same lines takes the older one's place.
    let waiting = [...pending];
    let proposing: Promise<unknown> = Promise.resolve();

    const tools = {
      read_part: tool({
        description:
          "Read one part of the profile (a section or one experience) by its key from the index.",
        inputSchema: z.object({
          part: z.string().describe("The part's key, exactly as in the index"),
        }),
        execute: ({ part }) => {
          const text = partText(blocks, part);
          return text === null
            ? { error: "No such part; use a key from the index." }
            : { text };
        },
      }),
      suggest_change: tool({
        description:
          "Propose one change to the profile. It is shown in the text as a tracked change the person accepts or rejects; nothing changes until they accept.",
        inputSchema: z.object({
          part: z.string().describe("The part's key, exactly as in the index"),
          find: z
            .string()
            .describe(
              "The line or consecutive lines to replace, copied exactly from the part; empty to add at the end of the part"
            ),
          replace: z
            .string()
            .describe(
              "The new line or lines, in the profile's Markdown format; empty to remove the lines"
            ),
          reason: z
            .string()
            .describe(
              "One short sentence shown to the person with the change, in their language"
            ),
        }),
        execute: ({ part, find, replace, reason }) => {
          // One at a time: calls of the same step run together, and each
          // must see what the one before it left waiting.
          const result = proposing.then(async () => {
            const suggested = await proposeSuggestion({
              db,
              cipher,
              documentId: document.id,
              draft: blocks,
              origin: "agent",
              change: { part, find, replace },
              reason,
              sources,
              pending: waiting,
            });
            if (!suggested.ok) return { error: refusalText(suggested.refusal) };
            waiting = [
              ...waiting.filter(
                (other) => !suggested.supersededIds.includes(other.id)
              ),
              suggested.suggestion,
            ];
            deps.reportSuggestion(suggested.suggestion.id);
            return {
              proposed: true,
              replacedEarlierSuggestion: suggested.supersededIds.length > 0,
              // For the page, to open the change in the text.
              profileSuggestionId: suggested.suggestion.id,
              note: "It waits for the person in the text; nothing changed yet.",
            };
          });
          // A call that failed doesn't fail the ones after it.
          proposing = result.catch(() => undefined);
          return result;
        },
      }),
      resolve_review_note: tool({
        description:
          "Ignore (dismiss) one open quality-review note, by its number in the list: only when the profile already answers it somewhere, or the person said it doesn't apply. The note leaves the list and the underline; the profile is not changed.",
        inputSchema: z.object({
          note: z
            .number()
            .int()
            .describe("The note's number, as in the open notes list"),
          reason: z
            .string()
            .describe("Where the profile answers it, or why it doesn't apply"),
        }),
        execute: async ({ note }) => {
          const found = reviewNotes[note - 1];
          if (!found) return { error: "No such note; use a number listed." };
          await profileService.setFindingDismissed({
            userId,
            findingKey: found.key,
            dismissed: true,
          });
          deps.reportReviewResolved?.();
          return { resolved: true };
        },
      }),
    };

    return {
      result: deps.streamText({
        model: (deps.model ?? languageModel)(modelId),
        system: buildAgentPrompt({
          language: readStructure(blocks).language,
          today: new Date().toISOString().slice(0, 10),
          parts,
          gaps: extract.gaps,
          rules: extract.rules,
          quote: quotedPassage(blocks, parts, input.messages),
          pending,
          rejected,
          reviewNotes,
        }),
        messages: startingWithUser(
          withoutReasoning(
            historyWindow(input.messages, agentSettings.historyWindow)
          )
        ),
        tools,
        stopWhen: stepCountIs(agentSettings.maxSteps),
        // The last step answers in words: a turn spent reading and
        // suggesting would otherwise end without a reply to the user.
        prepareStep: ({ stepNumber }) =>
          stepNumber >= agentSettings.maxSteps - 1
            ? { toolChoice: "none" as const }
            : undefined,
        maxOutputTokens: agentSettings.maxOutputTokens,
        abortSignal: input.signal,
        experimental_transform: limitQuestions(
          agentSettings.maxQuestionsPerMessage
        ),
        // No spans: they would carry the passage and the profile's parts
        // into the run trace (ADR 0007).
        experimental_telemetry: { isEnabled: false },
      }),
      turn,
    };
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
