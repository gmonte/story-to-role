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
import { findQuote } from "@repo/api/utils/text/verify-quote";

import { ProfileRepository } from "../profile-repository";
import {
  proposeSuggestion,
  type ProposalRefusal,
  type SuggestionContent,
} from "../suggestions/propose-suggestion";
import { parseBlocks, type ProfileBlock } from "../truth/blocks";
import { extractProfile } from "../truth/extract";
import { readStructure } from "../truth/structure";
import {
  listParts,
  partText,
  type ProfileChange,
  type ProfilePart,
} from "../truth/suggestions";
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
  streamText: typeof streamTextFn;
  // The agent's model instead of the turn's own (tests pass a mock).
  model?: (modelId: string) => LanguageModel;
  // A suggestion was just proposed: the page shows it in the text at once.
  reportSuggestion: (profileSuggestionId: string) => void;
};

// How many rejected suggestions the agent is reminded of.
const rememberedRejections = 5;

const refusals: Record<ProposalRefusal["kind"], string> = {
  empty:
    "Nothing to change: give the lines to replace, the new lines, or both.",
  notFound:
    "Those lines aren't in that part as written. Read the part with read_part and copy the lines exactly, or leave `find` empty to add at its end.",
  unchanged: "The new lines are the same as the ones they replace.",
  overlapsPending:
    "Those lines already have a suggestion waiting for the person. Tell them to accept or reject it in the text first.",
  ungivenFigures: "",
};

function refusalText(refusal: ProposalRefusal) {
  return refusal.kind === "ungivenFigures"
    ? `Refused: the person never wrote ${refusal.figures.join(", ")}. Write the figure exactly as they did, or ask them for it; never supply a number yourself.`
    : refusals[refusal.kind];
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

/** The part the quoted passage is in: an experience before its section. */
function partOfQuote(
  blocks: ProfileBlock[],
  parts: ProfilePart[],
  quote: string
) {
  const firstLine = quote.split("\n")[0];
  const candidates = [
    ...parts.filter((part) => part.kind === "experience"),
    ...parts.filter((part) => part.kind === "section"),
  ];
  return (
    candidates.find((part) => {
      const text = partText(blocks, part.key);
      return text && findQuote(text, firstLine);
    }) ?? null
  );
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
    }),
    turn: null as OpenTurn | null,
  });

  if (!message) return fixed(fixedReply("off_topic", replyLanguage));
  if (message.length > agentSettings.maxMessageCharacters) {
    return fixed(fixedReply("too_long", replyLanguage));
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
    const content = (row: { encryptedContent: string }) =>
      JSON.parse(cipher.decrypt(row.encryptedContent)) as SuggestionContent;
    const pending = (await repository.listPendingSuggestions(document.id)).map(
      content
    );
    const rejected = (
      await repository.listResolvedSuggestions(
        document.id,
        rememberedRejections
      )
    )
      .filter((row) => row.status === "rejected")
      .map(content);

    const parts = listParts(blocks);
    const extract = extractProfile(blocks);
    const { quote } = splitAgentMessage(message);
    const quotedPart = quote ? partOfQuote(blocks, parts, quote) : null;
    const sources = userWords(input.messages);
    // What this turn proposes also blocks a second rewrite of its lines.
    const waiting: ProfileChange[] = [...pending];
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
        execute: ({ part, find, replace, reason }) =>
          // One at a time: calls of the same step run together, and each
          // must see what the one before it left waiting.
          (proposing = proposing.then(async () => {
            const proposal = await proposeSuggestion({
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
            if (!proposal.ok) return { error: refusalText(proposal.refusal) };
            waiting.push(proposal.suggestion);
            deps.reportSuggestion(proposal.suggestion.id);
            return {
              proposed: true,
              // For the page, to open the change in the text.
              profileSuggestionId: proposal.suggestion.id,
              note: "It waits for the person in the text; nothing changed yet.",
            };
          })),
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
          quote: quote
            ? {
                text: quote,
                part: quotedPart,
                partText: quotedPart && partText(blocks, quotedPart.key),
              }
            : null,
          pending,
          rejected,
        }),
        messages: startingWithUser(
          withoutReasoning(input.messages.slice(-agentSettings.historyWindow))
        ),
        tools,
        stopWhen: stepCountIs(agentSettings.maxSteps),
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
