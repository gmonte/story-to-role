import { stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";

import { AgentChatRepository } from "@repo/api/domains/agents/agent-chat-repository";
import { splitAgentMessage } from "@repo/api/domains/agents/agent-message";
import { agentSettings } from "@repo/api/domains/agents/agent-settings";
import {
  guardAgentTurn,
  type AgentTurnDeps,
  type OpenTurn,
} from "@repo/api/domains/agents/agent-turn";
import {
  lastText,
  startingWithUser,
  withoutReasoning,
} from "@repo/api/domains/agents/chat-history";
import { detectLanguage } from "@repo/api/domains/agents/detect-language";
import { limitQuestions } from "@repo/api/domains/agents/question-limit";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { partText } from "@repo/api/domains/profile/truth/suggestions";

import { loadDocumentAgentContext } from "./document-agent-context";
import { buildDocumentAgentPrompt } from "./document-agent-prompt";

export type { AgentTurnDeps, OpenTurn };

/** The user's messages of the conversation, latest last, as the chat split them. */
function userMessages(messages: ModelMessage[]) {
  return messages.flatMap((message) =>
    message.role !== "user"
      ? []
      : [
          splitAgentMessage(
            typeof message.content === "string"
              ? message.content
              : message.content
                  .flatMap((part) => (part.type === "text" ? [part.text] : []))
                  .join("\n")
          ),
        ]
  );
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
 * One message to a document agent (ADR 0009). The chat id leads to its
 * user and its document, never anything the browser sends. The shared
 * guardrails answer from code when they block; otherwise the agent streams
 * its reply with this turn's context: the version the person is on with
 * its traces, the frozen profile version's index (readable part by part),
 * the settings, the purpose, the rules and the findings. It changes
 * nothing: in this slice it answers and discusses.
 */
export async function runDocumentAgentTurn(
  deps: AgentTurnDeps,
  input: { chatId: string; messages: ModelMessage[]; signal?: AbortSignal }
) {
  const { db } = deps;
  const chat = await new AgentChatRepository(db).findChat(input.chatId);
  if (chat?.subject !== "document" || !chat.documentId) {
    throw new Error("Unknown document chat");
  }
  const userId = chat.userId;
  const cipher = await getUserCipher(db, userId);
  const said = userMessages(input.messages);
  const last = said.at(-1);
  // The version the person is on: the latest message that says.
  const versionId = said.findLast((message) => message.version)?.version;
  const context = await loadDocumentAgentContext({
    db,
    cipher,
    userId,
    documentId: chat.documentId,
    versionId,
  });
  if (!context) throw new Error("The document has nothing to talk about yet");

  const message = lastText(input.messages, "user")?.trim() ?? "";
  const guarded = await guardAgentTurn(deps, {
    chat,
    taskType: "document_agent_turn",
    topic: "document",
    messages: input.messages,
    // Fixed replies follow the user's message; the document's language
    // decides when the message doesn't say.
    replyLanguage:
      detectLanguage(splitAgentMessage(message).text) ?? context.language,
  });
  if (guarded.kind === "fixed") {
    return { result: guarded.result, turn: guarded.turn };
  }
  const { model, turn } = guarded;

  try {
    const blocks = context.profile?.blocks ?? [];
    const tools = {
      read_part: tool({
        description:
          "Read one part of the profile version the document froze (a section or one experience) by its key from the index.",
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
    };
    return {
      result: deps.streamText({
        model,
        system: buildDocumentAgentPrompt({
          context,
          today: new Date().toISOString().slice(0, 10),
          // The passage stays the topic for the answers that follow it.
          quote: said.findLast((candidate) => candidate.quote)?.quote ?? null,
          attachment: last?.attachment ?? null,
        }),
        messages: startingWithUser(
          withoutReasoning(
            historyWindow(input.messages, agentSettings.historyWindow)
          )
        ),
        tools,
        stopWhen: stepCountIs(agentSettings.maxSteps),
        // The last step answers in words: a turn spent reading would
        // otherwise end without a reply to the user.
        prepareStep: ({ stepNumber }) =>
          stepNumber >= agentSettings.maxSteps - 1
            ? { toolChoice: "none" as const }
            : undefined,
        maxOutputTokens: agentSettings.maxOutputTokens,
        abortSignal: input.signal,
        experimental_transform: limitQuestions(
          agentSettings.maxQuestionsPerMessage
        ),
        // No spans: they would carry the document and the profile's parts
        // into the run trace (ADR 0007).
        experimental_telemetry: { isEnabled: false },
      }),
      turn,
    };
  } catch (error) {
    return guarded.fail(error);
  }
}
