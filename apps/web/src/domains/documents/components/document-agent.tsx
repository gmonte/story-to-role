"use client";

import { useEffect, useRef, useState } from "react";

import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { Loader2, Sparkles } from "lucide-react";

import { composeAgentMessage } from "@repo/api/domains/agents/agent-message";
import { agentSettings } from "@repo/api/domains/agents/agent-settings";
import type { documentAgent } from "@repo/api/domains/documents/tasks/document-agent";
import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

import { topmostNewSuggestion } from "~/domains/profile/utils/topmost-new-suggestion";
import { loadAgentChat } from "~/domains/agents/actions/agent-chat-actions";
import {
  ActivityRow,
  AgentComposer,
  AttachmentCard,
  ErrorRow,
  FailedRow,
  NewConversationBar,
  QuoteCard,
  UserMessage,
} from "~/domains/agents/components/agent-conversation";
import {
  useAgentChat,
  type ChatSession,
} from "~/domains/agents/hooks/use-agent-chat";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { useTRPC } from "~/tools/trpc/client";

import {
  maxDocumentQuoteCharacters,
  useDocumentAgent,
} from "./document-agent-context";
import { withoutLineIds } from "../utils/line-ids";

/**
 * The document agent (ADR 0009), beside the document: the user talks about
 * a passage they selected, a finding, or the document as a whole, and the
 * agent answers with the frozen profile version in view. One conversation
 * per document, whatever the version open.
 */

export function DocumentAgent({
  documentId,
  kind,
  version,
  onUseAnswer,
}: {
  documentId: string;
  kind: "resume" | "cover_letter" | "linkedin";
  // The version the user is on: each message says. Null while the letter
  // is still being prepared: there is nothing to change yet.
  version: VersionView | null;
  // Preparation only: the last reply, put in the motivation answer box.
  onUseAnswer?: (text: string) => void;
}) {
  const queryKey = ["document-chat", documentId];
  // Loaded afresh on every visit: what the agent said while the page was
  // elsewhere is only in the stored transcript, and useChat reads its
  // messages once, on mount.
  const loaded = useQuery({
    queryKey,
    queryFn: () => loadAgentChat({ kind: "document", documentId }),
    staleTime: Infinity,
    gcTime: 0,
  });
  if (!loaded.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }
  return (
    <Conversation
      key={loaded.data.chatId}
      documentId={documentId}
      kind={kind}
      versionId={version?.id ?? null}
      onUseAnswer={onUseAnswer}
      chatId={loaded.data.chatId}
      initialMessages={loaded.data.messages}
      session={loaded.data.session}
      // A chat that replaced another takes the focus: the user was typing.
      focusOnMount={"replaced" in loaded.data}
    />
  );
}

type ToolPart = {
  type: string;
  state?: string;
  input?: { part?: string; reason?: string };
  output?: { error?: string; proposed?: boolean; documentChangeId?: string };
};

/** A tool call of the agent among a message's parts, read loosely. */
const toolPart = (part: { type: string }) =>
  part.type.startsWith("tool-") ? (part as ToolPart) : null;

function Conversation({
  documentId,
  kind,
  versionId,
  onUseAnswer,
  chatId,
  initialMessages,
  session,
  focusOnMount,
}: {
  documentId: string;
  kind: "resume" | "cover_letter" | "linkedin";
  versionId: string | null;
  onUseAnswer?: (text: string) => void;
  chatId: string;
  initialMessages: UIMessage[];
  session: ChatSession | null;
  focusOnMount: boolean;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const credits = useCredits();
  const agent = useDocumentAgent();
  const topic = agent?.topic ?? null;
  const quote = topic?.quote ?? null;
  const attachment = topic?.attachment ?? null;
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusOnMount) input.current?.focus();
  }, [focusOnMount]);
  // The changes waiting in the text, to say which suggestion was answered.
  const waiting = useQuery(
    trpc.documents.changes.queryOptions(versionId ? { versionId } : skipToken)
  );
  const waitingIds = new Set((waiting.data ?? []).map((change) => change.id));
  const staleIds = new Set(
    (waiting.data ?? []).filter((change) => change.stale).map((c) => c.id)
  );
  // The changes there were when the turn began: the first new one is
  // shown once the turn ends.
  const knownIds = useRef<Set<string>>(new Set());
  const [turnDone, setTurnDone] = useState(0);

  const {
    messages,
    sendMessage,
    status,
    error,
    stop,
    busy,
    failed,
    watchdog,
    resend,
    startNew,
    startingNew,
    last,
    streamingText,
  } = useAgentChat<typeof documentAgent>({
    task: "document_agent",
    subject: { kind: "document", documentId },
    queryKey: ["document-chat", documentId],
    chatId,
    initialMessages,
    session,
    onData: (part) => {
      // A change was just proposed: it shows in the text at once.
      if (part.type === "data-change")
        void agent?.changeHooks.current?.refresh();
    },
    onFinish: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.credits.pathKey() });
      setTurnDone((n) => n + 1);
    },
  });
  useEffect(() => {
    if (busy) {
      knownIds.current = new Set(agent?.changeHooks.current?.pendingIds());
    }
    // Only the start of a turn takes the snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);
  useEffect(() => {
    if (!turnDone) return;
    const hooks = agent?.changeHooks.current;
    if (!hooks) return;
    void hooks.refresh().then((located) => {
      const first = topmostNewSuggestion(knownIds.current, located);
      if (first) hooks.show(first.id);
    });
    // Once per finished turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnDone]);

  // A passage or a finding sent here from the document: the composer takes
  // focus, the person's words still to write.
  const topicId = topic?.id;
  useEffect(() => {
    if (!topic) return;
    input.current?.focus();
    // Only when a new topic arrives, not when its quote is cleared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  async function restart() {
    try {
      await startNew(() => {
        agent?.clearQuote();
        agent?.clearAttachment();
        setText("");
      });
    } catch {
      toast.error(
        t.formatMessage({
          defaultMessage: "The conversation couldn't be restarted. Try again.",
        })
      );
    }
  }

  function send(words: string) {
    // An attachment alone is a question: how to read it.
    if ((!words.trim() && !attachment) || busy) return;
    watchdog.reset();
    void sendMessage({
      text: composeAgentMessage(quote, words, null, attachment, versionId),
    });
    setText("");
    agent?.clearQuote();
    agent?.clearAttachment();
  }

  // The last reply's words, for the motivation answer box.
  const lastReply =
    last?.role === "assistant"
      ? last.parts
          .flatMap((part) => (part.type === "text" ? [part.text] : []))
          .join("\n")
          .trim()
      : "";

  // What the agent is doing right now, in words: never a still label.
  const running =
    last?.role === "assistant"
      ? last.parts
          .flatMap((part) => toolPart(part) ?? [])
          .findLast(
            (part) =>
              part.state === "input-streaming" ||
              part.state === "input-available"
          )
      : undefined;
  const activity = running
    ? running.type === "tool-propose_change"
      ? t.formatMessage({ defaultMessage: "Writing a suggestion…" })
      : t.formatMessage({ defaultMessage: "Reading your profile…" })
    : t.formatMessage({ defaultMessage: "Thinking…" });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <NewConversationBar
        show={messages.length > 0}
        starting={startingNew}
        description={t.formatMessage({
          defaultMessage:
            "The questions and answers of this conversation will be deleted. The document and everything you changed in it stay.",
        })}
        onConfirm={() => void restart()}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ol className="flex flex-col gap-3 p-4">
          {messages.length === 0 && (
            <Introduction kind={kind} preparing={!versionId} />
          )}
          {messages.map((message) =>
            message.role === "user" ? (
              <UserMessage key={message.id} message={message} />
            ) : message.parts.length === 0 ? null : (
              <li key={message.id} className="flex flex-col gap-2 self-start">
                {message.parts.map((part, index) => {
                  if (part.type === "text" && part.text) {
                    return (
                      <p key={index} className="text-sm whitespace-pre-wrap">
                        {withoutLineIds(part.text)}
                      </p>
                    );
                  }
                  const call = toolPart(part);
                  const proposed = call?.output?.documentChangeId;
                  if (call?.type !== "tool-propose_change" || !proposed) {
                    return null;
                  }
                  const stale = staleIds.has(proposed);
                  const stillWaiting = waitingIds.has(proposed) && !stale;
                  return (
                    <button
                      key={index}
                      type="button"
                      disabled={!stillWaiting}
                      onClick={() => agent?.changeHooks.current?.show(proposed)}
                      className="bg-primary/5 hover:bg-primary/10 flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs disabled:opacity-60"
                    >
                      <Sparkles className="text-brand-accent mt-0.5 size-3.5 shrink-0" />
                      <span>
                        <span className="block font-medium">
                          {stale
                            ? t.formatMessage({
                                defaultMessage:
                                  "No longer applies — the text changed",
                              })
                            : stillWaiting
                              ? t.formatMessage({
                                  defaultMessage:
                                    "Suggestion waiting in the text",
                                })
                              : t.formatMessage({
                                  defaultMessage: "Suggestion answered",
                                })}
                        </span>
                        <span className="text-muted-foreground">
                          {call.input?.reason}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </li>
            )
          )}
          {onUseAnswer && !busy && lastReply && (
            <li className="self-start">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUseAnswer(lastReply)}
              >
                {t.formatMessage({
                  defaultMessage: "Use this reply as my answer",
                })}
              </Button>
            </li>
          )}
          {busy && !streamingText && (
            <ActivityRow phase={watchdog.phase} activity={activity} />
          )}
          {failed && (
            <FailedRow
              onRetry={() => {
                watchdog.reset();
                void resend().catch(() => watchdog.fail());
              }}
            />
          )}
          {error && !failed && <ErrorRow />}
        </ol>
        <div ref={bottom} />
      </div>
      <AgentComposer
        id={`document-${documentId}`}
        inputRef={input}
        text={text}
        setText={setText}
        onSend={send}
        onStartNew={() => void restart()}
        busy={busy}
        canSend={!!text.trim() || !!attachment}
        onStop={() => void stop()}
        cost={credits.data?.estimates.agentMessage}
        nearReserve={credits.data?.nearReserve}
        // The quote travels in the message: the two share its limit.
        maxLength={
          agentSettings.maxMessageCharacters - maxDocumentQuoteCharacters - 100
        }
        placeholder={
          attachment
            ? t.formatMessage({
                defaultMessage: "What do you want to know about it?",
              })
            : quote
              ? t.formatMessage({ defaultMessage: "What about this passage?" })
              : kind === "resume"
                ? t.formatMessage({
                    defaultMessage: "Ask about your resume",
                  })
                : kind === "linkedin"
                  ? t.formatMessage({
                      defaultMessage: "Ask about your LinkedIn",
                    })
                  : t.formatMessage({
                      defaultMessage: "Ask about your cover letter",
                    })
        }
        cards={
          <>
            {quote && (
              <QuoteCard
                quote={quote}
                removeLabel={t.formatMessage({
                  defaultMessage: "Talk about the whole document instead",
                })}
                onRemove={() => agent?.clearQuote()}
              />
            )}
            {attachment && (
              <AttachmentCard
                attachment={attachment}
                onRemove={() => agent?.clearAttachment()}
              />
            )}
          </>
        }
      />
    </div>
  );
}

/** The empty conversation: what the agent does. */
function Introduction({
  kind,
  preparing,
}: {
  kind: "resume" | "cover_letter" | "linkedin";
  preparing: boolean;
}) {
  const t = useTranslation();
  if (preparing) {
    return (
      <li className="flex flex-col items-center gap-3 px-2 py-8 text-center">
        <Sparkles className="text-brand-accent size-5" />
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t.formatMessage({ defaultMessage: "Your cover letter's agent" })}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t.formatMessage({
            defaultMessage:
              "I'm ready while you prepare the letter: ask me to phrase an answer, explain a company fact or suggest what to emphasise. I know your profile, this opening and what you chose so far, and I never invent a fact or a number.",
          })}
        </p>
      </li>
    );
  }
  return (
    <li className="flex flex-col items-center gap-3 px-2 py-8 text-center">
      <Sparkles className="text-brand-accent size-5" />
      <h2 className="font-display text-lg font-semibold tracking-tight">
        {kind === "resume"
          ? t.formatMessage({ defaultMessage: "Your resume's agent" })
          : kind === "linkedin"
            ? t.formatMessage({ defaultMessage: "Your LinkedIn's agent" })
            : t.formatMessage({ defaultMessage: "Your cover letter's agent" })}
      </h2>
      <p className="text-muted-foreground text-sm">
        {t.formatMessage({
          defaultMessage:
            "Select any passage of the document, or a finding, to talk about it. I know the profile version this document was written from, the opening and its review, and I never invent a fact or a number.",
        })}
      </p>
    </li>
  );
}
