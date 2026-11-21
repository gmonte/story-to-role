"use client";

import { useEffect, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChatActions } from "@trigger.dev/sdk/chat/react";
import type { UIMessage } from "ai";
import {
  Check,
  Loader2,
  Paperclip,
  PencilLine,
  Sparkles,
  X,
} from "lucide-react";

import { composeAgentMessage } from "@repo/api/domains/agents/agent-message";
import { agentSettings } from "@repo/api/domains/agents/agent-settings";
import type { profileAgent } from "@repo/api/domains/profile/tasks/profile-agent";
import { listParts } from "@repo/api/domains/profile/truth/suggestions";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

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
  withStored,
} from "~/domains/agents/components/agent-conversation";
import {
  useAgentChat,
  type ChatSession,
} from "~/domains/agents/hooks/use-agent-chat";
import { SourceImportStatus } from "~/domains/career/components/source-import-status";
import {
  useRefreshCareer,
  useTimeline,
} from "~/domains/career/hooks/use-career-queries";
import {
  sourceAccept,
  useSourceUpload,
} from "~/domains/career/hooks/use-source-upload";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { useTRPC } from "~/tools/trpc/client";
import { decisionButton } from "~/domains/workspace/utils/decision-buttons";

import { topmostNewSuggestion } from "../utils/topmost-new-suggestion";
import { maxQuoteCharacters, useProfileEditor } from "./profile-editor-context";

const subject = { kind: "profile" } as const;
const queryKey = ["profile-chat"];

/**
 * The profile agent, beside the document (profile spec, "The agent"): the
 * user talks about a passage they selected, a finding, or the profile as a
 * whole; the agent interviews per the method and proposes changes that
 * show in the text to accept or reject.
 */
export function ProfileAgent() {
  // Loaded afresh on every visit: what the agent said while the page was
  // elsewhere is only in the stored transcript, and useChat reads its
  // messages once, on mount.
  const loaded = useQuery({
    queryKey,
    queryFn: () => loadAgentChat(subject),
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
  output?: { error?: string; proposed?: boolean; profileSuggestionId?: string };
};

/** A tool call of the agent among a message's parts, read loosely. */
const toolPart = (part: { type: string }) =>
  part.type.startsWith("tool-") ? (part as ToolPart) : null;

function Conversation({
  chatId,
  initialMessages,
  session,
  focusOnMount,
}: {
  chatId: string;
  initialMessages: UIMessage[];
  session: ChatSession | null;
  focusOnMount: boolean;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const credits = useCredits();
  const {
    blocks,
    saveNow,
    agentTopic,
    clearAgentQuote,
    clearAgentAttachment,
    refreshSuggestions,
    refreshDismissed,
    suggestions,
    goToLine,
    scrollToLine,
    acceptSuggestions,
    rejectSuggestions,
  } = useProfileEditor();
  const [text, setText] = useState("");
  const [turnDone, setTurnDone] = useState(0);
  // The suggestions there were when the turn began.
  const knownIds = useRef<Set<string>>(new Set());
  const latestSuggestions = useRef(suggestions);
  latestSuggestions.current = suggestions;
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusOnMount) input.current?.focus();
  }, [focusOnMount]);
  const quote = agentTopic?.quote ?? null;
  const attachment = agentTopic?.attachment ?? null;

  const {
    messages,
    sendMessage,
    setMessages,
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
  } = useAgentChat<typeof profileAgent>({
    task: "profile_agent",
    subject,
    queryKey,
    chatId,
    initialMessages,
    session,
    onData: (part) => {
      // A suggestion was just proposed: it shows in the text at once.
      if (part.type === "data-suggestion") void refreshSuggestions();
      if (part.type === "data-review-resolved") void refreshDismissed();
    },
    onFinish: () => {
      // Once the turn's suggestions are loaded, show the first new one.
      void refreshSuggestions().then(() => setTurnDone((n) => n + 1));
      void refreshDismissed();
      void queryClient.invalidateQueries({ queryKey: trpc.credits.pathKey() });
    },
  });
  useEffect(() => {
    if (busy) {
      knownIds.current = new Set(latestSuggestions.current.map((s) => s.id));
    }
    // Only the start of a turn takes the snapshot.
  }, [busy]);
  useEffect(() => {
    if (!turnDone) return;
    const first = topmostNewSuggestion(
      knownIds.current,
      latestSuggestions.current
    );
    if (first) scrollToLine(first.range!.start);
    // Once per finished turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnDone]);
  const { sendAction } = useChatActions({ sendMessage });

  // Files attached here are sources like any other: each is read into
  // suggestions for the profile.
  const timeline = useTimeline();
  const refreshCareer = useRefreshCareer();
  const documents = timeline.data?.documents ?? [];
  const fileInput = useRef<HTMLInputElement>(null);
  const { add } = useSourceUpload({ documents, beforeUpload: saveNow });
  const importing = documents.filter(
    (document) => document.importStatus === "importing"
  );

  // The agent sums up an import that ended (here or while the page was
  // away): the page asks for it once the chat is free.
  // Which summaries are waiting: asked for once (twice if the first try
  // fails), never in a loop when one can't be said.
  const unsaid = documents
    .filter((document) => document.summaryPending)
    .map((document) => document.id)
    .sort()
    .join(",");
  const asking = useRef(false);
  const asked = useRef(new Map<string, number>());
  const catchUp = useRef<() => void>(undefined);
  catchUp.current = () => {
    if (asking.current || (asked.current.get(unsaid) ?? 0) >= 2) return;
    asking.current = true;
    asked.current.set(unsaid, (asked.current.get(unsaid) ?? 0) + 1);
    // The answer to a request without a message continues the last
    // assistant message: an empty one takes it, so earlier ones stay.
    setMessages((current) => [
      ...current,
      { id: `catch-up-${Date.now()}`, role: "assistant", parts: [] },
    ]);
    void sendAction({ type: "catch_up" }).finally(async () => {
      // The stored transcript catches up what the stream may have missed;
      // what the stream showed stays, as the store may not have it yet.
      const stored = (await loadAgentChat(subject)).messages;
      setMessages((current) => withStored(current, stored));
      // The sources say it was said before another request may go.
      await refreshCareer();
      asking.current = false;
    });
  };
  useEffect(() => {
    if (unsaid && !busy) catchUp.current?.();
  }, [unsaid, busy]);

  // A passage or a finding sent here from the document: the composer takes
  // focus, the person's words still to write.
  const topicId = agentTopic?.id;
  useEffect(() => {
    if (!agentTopic) return;
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
        clearAgentQuote();
        clearAgentAttachment();
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

  async function send(words: string) {
    // An attachment alone is a question: how to resolve it.
    if ((!words.trim() && !attachment) || busy) return;
    watchdog.reset();
    // The agent reads the saved draft: what was just typed goes first.
    if ((await saveNow()) === null) {
      toast.error(
        t.formatMessage({
          defaultMessage: "Save the profile before talking to the agent.",
        })
      );
      return;
    }
    void sendMessage({
      text: composeAgentMessage(quote, words, agentTopic?.part, attachment),
    });
    setText("");
    clearAgentQuote();
    clearAgentAttachment();
  }

  // The import's cost shows where the file is attached, too.
  const attachLabel = t.formatMessage(
    {
      defaultMessage:
        "Attach a resume or a text file (read into suggestions: up to {credits, plural, =0 {no credits} one {# credit} other {# credits}} each)",
    },
    { credits: credits.data?.estimates.sourceImport ?? 0 }
  );
  const interviewRequest = t.formatMessage({
    defaultMessage:
      "Interview me to fill in my profile, one position at a time.",
  });

  const partTitle = (key: string | undefined) =>
    listParts(blocks)
      .find((part) => part.key === key)
      ?.title.replace(/\s*\(.*\)$/, "") ?? "";

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
    ? running.type === "tool-suggest_change"
      ? t.formatMessage({ defaultMessage: "Writing a suggestion…" })
      : t.formatMessage(
          { defaultMessage: "Reading {part}…" },
          {
            part:
              partTitle(running.input?.part) ||
              t.formatMessage({ defaultMessage: "the profile" }),
          }
        )
    : last?.id.startsWith("catch-up-")
      ? t.formatMessage({ defaultMessage: "Summing up what the file added…" })
      : t.formatMessage({ defaultMessage: "Thinking…" });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <NewConversationBar
        show={messages.length > 0}
        starting={startingNew}
        description={t.formatMessage({
          defaultMessage:
            "The questions and answers of this conversation will be deleted. Everything already in your profile stays: the accepted changes and the suggestions still waiting for your answer in the text.",
        })}
        onConfirm={() => void restart()}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ol className="flex flex-col gap-3 p-4">
          {messages.length === 0 && (
            <Introduction
              disabled={busy}
              onInterview={() => void send(interviewRequest)}
            />
          )}
          {messages.map((message) =>
            message.role === "user" ? (
              <UserMessage
                key={message.id}
                message={message}
                from={partTitle}
              />
            ) : message.parts.length === 0 ? null : (
              <li key={message.id} className="flex flex-col gap-2 self-start">
                {message.parts.map((part, index) => {
                  if (part.type === "text" && part.text) {
                    return (
                      <p key={index} className="text-sm whitespace-pre-wrap">
                        {part.text}
                      </p>
                    );
                  }
                  const call = toolPart(part);
                  const proposed = call?.output?.profileSuggestionId;
                  if (call?.type !== "tool-suggest_change" || !proposed) {
                    return null;
                  }
                  const waiting = suggestions.find((s) => s.id === proposed);
                  if (waiting) {
                    // The change itself, to answer here or in the text.
                    return (
                      <div
                        key={index}
                        className="bg-card flex flex-col gap-2 rounded-lg border p-3 text-sm"
                      >
                        <button
                          type="button"
                          disabled={!waiting.range}
                          onClick={() =>
                            waiting.range && goToLine(waiting.range.start)
                          }
                          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-left text-xs"
                        >
                          <PencilLine className="size-3.5 shrink-0" />
                          {t.formatMessage(
                            { defaultMessage: "Suggestion for {part}" },
                            { part: waiting.part }
                          )}
                        </button>
                        {waiting.find && (
                          <p className="text-muted-foreground line-through decoration-1">
                            {waiting.find}
                          </p>
                        )}
                        <p className="bg-fit-high-soft rounded-md px-2.5 py-2">
                          {waiting.replace}
                        </p>
                        {call.input?.reason && (
                          <p className="text-muted-foreground text-xs">
                            {call.input.reason}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            className={decisionButton}
                            onClick={() => acceptSuggestions([waiting.id])}
                          >
                            <Check />
                            {t.formatMessage({ defaultMessage: "Accept" })}
                          </Button>
                          <Button
                            variant="outline"
                            className={decisionButton}
                            onClick={() => rejectSuggestions([waiting.id])}
                          >
                            <X />
                            {t.formatMessage({ defaultMessage: "Reject" })}
                          </Button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <p
                      key={index}
                      className="text-muted-foreground flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs"
                    >
                      <Sparkles className="text-brand-accent mt-0.5 size-3.5 shrink-0" />
                      <span>
                        <span className="text-foreground block font-medium">
                          {t.formatMessage({
                            defaultMessage: "Suggestion answered",
                          })}
                        </span>
                        {call.input?.reason}
                      </span>
                    </p>
                  );
                })}
              </li>
            )
          )}
          {importing.map((document) => (
            <li key={document.id} className="w-full self-start">
              <SourceImportStatus document={document} />
            </li>
          ))}
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

      <input
        ref={fileInput}
        type="file"
        accept={sourceAccept}
        multiple
        hidden
        onChange={(event) => {
          add(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <AgentComposer
        id="profile"
        inputRef={input}
        text={text}
        setText={setText}
        onSend={(words) => void send(words)}
        onStartNew={() => void restart()}
        busy={busy}
        canSend={!!text.trim()}
        onStop={() => void stop()}
        cost={credits.data?.estimates.agentMessage}
        nearReserve={credits.data?.nearReserve}
        // The quote travels in the message: the two share its limit.
        maxLength={
          agentSettings.maxMessageCharacters - maxQuoteCharacters - 100
        }
        placeholder={
          attachment
            ? t.formatMessage({
                defaultMessage: "What do you want to do about it?",
              })
            : quote
              ? t.formatMessage({ defaultMessage: "What about this passage?" })
              : t.formatMessage({
                  defaultMessage: "Tell what you did, or ask where to start",
                })
        }
        cards={
          <>
            {quote && (
              <QuoteCard
                title={
                  agentTopic?.part ? partTitle(agentTopic.part) : undefined
                }
                quote={quote}
                removeLabel={t.formatMessage({
                  defaultMessage: "Talk about the whole profile instead",
                })}
                onRemove={clearAgentQuote}
              />
            )}
            {attachment && (
              <AttachmentCard
                attachment={attachment}
                onRemove={clearAgentAttachment}
              />
            )}
          </>
        }
        actionsStart={
          messages.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void send(interviewRequest)}
              className="text-muted-foreground hover:text-foreground mr-auto ml-2 text-xs underline-offset-2 hover:underline disabled:opacity-50"
            >
              {t.formatMessage({ defaultMessage: "Interview me" })}
            </button>
          )
        }
        actionsEnd={
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-muted-foreground size-8"
            aria-label={attachLabel}
            title={attachLabel}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip />
          </Button>
        }
      />
    </div>
  );
}

/** The empty conversation: what the agent does and where to begin. */
function Introduction({
  disabled,
  onInterview,
}: {
  disabled: boolean;
  onInterview: () => void;
}) {
  const t = useTranslation();
  return (
    <li className="flex flex-col items-center gap-3 px-2 py-8 text-center">
      <Sparkles className="text-brand-accent size-5" />
      <h2 className="font-display text-lg font-semibold tracking-tight">
        {t.formatMessage({ defaultMessage: "Your profile agent" })}
      </h2>
      <p className="text-muted-foreground text-sm">
        {t.formatMessage({
          defaultMessage:
            "Select any passage of your profile, or a finding, to talk about it. I ask what a recruiter would, up to three questions at a time, and suggest changes you accept or reject in the text. I never invent a result or a number.",
        })}
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={onInterview}
      >
        {t.formatMessage({ defaultMessage: "Interview me" })}
      </Button>
    </li>
  );
}
