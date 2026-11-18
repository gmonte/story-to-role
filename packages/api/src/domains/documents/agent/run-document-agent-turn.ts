import { stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";

import { AgentChatRepository } from "@repo/api/domains/agents/agent-chat-repository";
import { splitAgentMessage } from "@repo/api/domains/agents/agent-message";
import { agentSettings } from "@repo/api/domains/agents/agent-settings";
import {
  guardAgentTurn,
  type AgentTurnDeps as SharedTurnDeps,
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

import { proposeChange, type ChangeRefusal } from "../changes/propose-change";
import { loadDocumentAgentContext } from "./document-agent-context";
import { buildDocumentAgentPrompt } from "./document-agent-prompt";

export type { OpenTurn };

export type AgentTurnDeps = SharedTurnDeps & {
  // A change was just proposed: the page shows it in the text at once.
  reportChange?: (documentChangeId: string) => void;
};

/** Why a change was refused, for the model to do better. */
function refusalText(refusal: ChangeRefusal) {
  switch (refusal.kind) {
    case "empty":
      return "Nothing to change: give the line to replace, the new line, or both.";
    case "locked":
      return "Refused: that is locked (a credential, a section title, a skills label, the dates). It changes only through the profile; tell the person so.";
    case "notRequested":
      return "Refused: that is a locked fact (the header, a position's employer, title or context). Propose changing it only when the person asked for that change in this conversation: pass `requestedBy` with their exact words asking for it, and only in the turn where they ask. They didn't ask for this one, so ask them first instead of proposing it.";
    case "noSuchPart":
      return "No such part: use a part key from the document (“[part: …]”).";
    case "notFound":
      return "That line isn't in that part exactly once as written (or what you add is already there). Copy the line's words exactly as the document shows them, without the id; leave `find` empty to add at the end of the part.";
    case "unchanged":
      return "The new line is the same as the one it replaces.";
    case "fixedLines":
      return "The summary and the skills are never emptied, a skills line keeps its label, and a new skills line is written “Label: item, item”. Give each header or facts line exactly as replaced, one for one.";
    case "ungivenFigures":
      return `Refused: neither the profile nor the person gave ${refusal.figures.join(", ")}. Write the figure exactly as they did, or ask them for it; never supply a number yourself.`;
  }
}

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
 * the settings, the purpose, the rules and the findings. It reads the
 * profile version and proposes changes through tools; it changes nothing
 * itself.
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
    const sources = said.map((message) => message.text);
    // What waits for the user, this turn's suggestions included: a newer
    // one on the same lines takes the older one's place.
    let waiting = [...context.pending];
    const turnChangeIds = new Set<string>();
    let proposing: Promise<unknown> = Promise.resolve();
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
      propose_change: tool({
        description:
          "Propose one change to the document: one line replaced, added or removed in one part (a bullet, a paragraph, the summary, a skills line, a header line, a position's employer, title or context). It is shown in the text as a tracked change the person accepts or rejects; nothing changes until they accept. A locked fact (the header, a position's employer, title or context) only when the person asked for that change: then `requestedBy` quotes their words.",
        inputSchema: z.object({
          part: z
            .string()
            .describe(
              "The part's key, exactly as in the document (“[part: …]”)"
            ),
          find: z
            .string()
            .describe(
              "The line to replace, copied exactly from the document without its id; empty to add at the end of the part"
            ),
          replace: z
            .string()
            .describe(
              "The whole new line, in the document's language; empty to remove the line"
            ),
          reason: z
            .string()
            .describe(
              "One short sentence shown to the person with the change, in their language"
            ),
          profilePassages: z
            .array(z.string())
            .optional()
            .describe(
              "The profile lines the change rests on, copied exactly from read_part; none for a fact the person gave in this conversation"
            ),
          requestedBy: z
            .string()
            .optional()
            .describe(
              "For a locked fact (the header, a position's employer, title or context): the person's exact words asking for this change, copied from their message in this conversation"
            ),
        }),
        execute: ({
          part,
          find,
          replace,
          reason,
          profilePassages,
          requestedBy,
        }) => {
          // One at a time: calls of the same step run together, and each
          // must see what the one before it left waiting.
          const result = proposing.then(async () => {
            const proposed = await proposeChange({
              db,
              cipher,
              versionId: context.versionId,
              snapshotId: context.snapshotId,
              content: context.content,
              origin: "document_agent",
              change: { part, find, replace },
              reason,
              profilePassages,
              evidence: context.evidence,
              profileText: context.profileText,
              sources,
              requestedBy,
              request: {
                said: sources,
                latest: [last?.text, last?.quote, last?.attachment?.text]
                  .filter(Boolean)
                  .join("\n"),
              },
              pending: waiting,
              sameTurnIds: turnChangeIds,
            });
            if (!proposed.ok) return { error: refusalText(proposed.refusal) };
            waiting = [
              ...waiting.filter(
                (other) => !proposed.supersededIds.includes(other.id)
              ),
              proposed.change,
            ];
            turnChangeIds.add(proposed.change.id);
            deps.reportChange?.(proposed.change.id);
            return {
              proposed: true,
              replacedEarlierSuggestion: proposed.supersededIds.length > 0,
              // For the page, to open the change in the text.
              documentChangeId: proposed.change.id,
              ...(proposed.unmatchedPassages.length
                ? {
                    note: `It waits for the person in the text; nothing changed yet. These passages aren't in the profile version as written and weren't recorded: ${proposed.unmatchedPassages.join(" | ")}`,
                  }
                : {
                    note: "It waits for the person in the text; nothing changed yet.",
                  }),
            };
          });
          // A call that failed doesn't fail the ones after it.
          proposing = result.catch(() => undefined);
          return result;
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
