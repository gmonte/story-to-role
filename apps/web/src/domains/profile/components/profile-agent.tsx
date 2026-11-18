"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { useChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useChatActions,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react";
import type { UIMessage } from "ai";
import {
  ArrowUp,
  Loader2,
  Paperclip,
  Quote,
  Sparkles,
  Square,
  X,
} from "lucide-react";

import {
  composeAgentMessage,
  splitAgentMessage,
} from "@repo/api/domains/profile/agent/agent-message";
import { agentSettings } from "@repo/api/domains/profile/agent/agent-settings";
import type { profileAgent } from "@repo/api/domains/profile/tasks/profile-agent";
import { listParts } from "@repo/api/domains/profile/truth/suggestions";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";

import { SourceImportStatus } from "~/domains/career/components/source-import-status";
import { VoiceInputButton } from "~/domains/career/components/voice-input-button";
import {
  useRefreshCareer,
  useTimeline,
} from "~/domains/career/hooks/use-career-queries";
import {
  sourceAccept,
  useSourceUpload,
} from "~/domains/career/hooks/use-source-upload";
import { CreditCost } from "~/domains/credits/components/credit-cost";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { useTRPC } from "~/tools/trpc/client";

import {
  loadProfileChat,
  mintProfileChatToken,
  recoverProfileChatRun,
  startProfileChatSession,
} from "../actions/profile-agent-actions";
import { useAnswerWatchdog } from "../hooks/use-answer-watchdog";
import { topmostNewSuggestion } from "../utils/topmost-new-suggestion";
import { maxQuoteCharacters, useProfileEditor } from "./profile-editor-context";

type ChatSession = { publicAccessToken: string; lastEventId?: string };

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
    queryKey: ["profile-chat"],
    queryFn: () => loadProfileChat(),
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
}: {
  chatId: string;
  initialMessages: UIMessage[];
  session: ChatSession | null;
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
    refreshSuggestions,
    suggestions,
    goToLine,
    scrollToLine,
  } = useProfileEditor();
  const [text, setText] = useState("");
  const [turnDone, setTurnDone] = useState(0);
  // The suggestions there were when the turn began.
  const knownIds = useRef<Set<string>>(new Set());
  const latestSuggestions = useRef(suggestions);
  latestSuggestions.current = suggestions;
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const quote = agentTopic?.quote ?? null;

  const transport = useTriggerChatTransport<typeof profileAgent>({
    task: "profile_agent",
    accessToken: (session) => mintProfileChatToken(session.chatId),
    startSession: (session) =>
      startProfileChatSession({ chatId: session.chatId }),
    // A session under way: reconnect to it instead of starting one.
    sessions: session ? { [chatId]: session } : undefined,
  });
  const {
    messages,
    sendMessage,
    regenerate,
    setMessages,
    status,
    error,
    stop,
  } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    resume: initialMessages.length > 0,
    onData: (part) => {
      // A suggestion was just proposed: it shows in the text at once.
      if (part.type === "data-suggestion") void refreshSuggestions();
    },
    onFinish: () => {
      // Once the turn's suggestions are loaded, show the first new one.
      void refreshSuggestions().then(() => setTurnDone((n) => n + 1));
      void queryClient.invalidateQueries({ queryKey: trpc.credits.pathKey() });
    },
  });
  const busy = status === "submitted" || status === "streaming";
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
      const stored = (await loadProfileChat()).messages;
      setMessages((current) => withStored(current, stored));
      // The sources say it was said before another request may go.
      await refreshCareer();
      asking.current = false;
    });
  };
  useEffect(() => {
    if (unsaid && !busy) catchUp.current?.();
  }, [unsaid, busy]);

  // A passage or a finding sent here from the document: its words go to the
  // composer, ready to send.
  const topicId = agentTopic?.id;
  useEffect(() => {
    if (!agentTopic) return;
    if (agentTopic.text) setText(agentTopic.text);
    input.current?.focus();
    // Only when a new topic arrives, not when its quote is cleared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  // An answer that never starts (the run holding the session died, say):
  // the run is cancelled and the same message goes again, once; if that is
  // not answered either, the user is asked instead of looping.
  const resend = async () => {
    await recoverProfileChatRun({ chatId });
    await stop();
    // Same message, same id: the agent doesn't take it twice.
    await regenerate();
  };
  const watchdog = useAnswerWatchdog({
    status,
    timeoutMs: agentSettings.answerStartTimeoutMs,
    recover: resend,
  });
  const failed = watchdog.phase === "failed";
  useEffect(() => {
    if (failed) void stop();
  }, [failed, stop]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  async function send(words: string) {
    if (!words.trim() || busy) return;
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
      text: composeAgentMessage(quote, words, agentTopic?.part),
    });
    setText("");
    clearAgentQuote();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(text);
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
  const last = messages.at(-1);
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
  const streamingText =
    status === "streaming" &&
    last?.role === "assistant" &&
    last.parts.at(-1)?.type === "text";

  return (
    <div className="flex h-full min-h-0 flex-col">
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
                partTitle={partTitle}
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
                  return (
                    <button
                      key={index}
                      type="button"
                      disabled={!waiting?.range}
                      onClick={() =>
                        waiting?.range && goToLine(waiting.range.start)
                      }
                      className="bg-primary/5 hover:bg-primary/10 flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs disabled:opacity-60"
                    >
                      <Sparkles className="text-primary mt-0.5 size-3.5 shrink-0" />
                      <span>
                        <span className="block font-medium">
                          {waiting
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
          {importing.map((document) => (
            <li key={document.id} className="w-full self-start">
              <SourceImportStatus document={document} />
            </li>
          ))}
          {busy && !streamingText && (
            <li
              role="status"
              className="text-muted-foreground flex items-center gap-2 self-start text-sm"
            >
              <Sparkles className="text-primary size-4 motion-safe:animate-pulse" />
              <span className="from-foreground via-muted-foreground to-foreground motion-safe:animate-shimmer bg-linear-to-r bg-[length:200%_100%] bg-clip-text text-transparent">
                {watchdog.phase === "recovering"
                  ? t.formatMessage({
                      defaultMessage: "Reconnecting to the agent…",
                    })
                  : activity}
              </span>
            </li>
          )}
          {failed && (
            <li
              role="alert"
              className="text-destructive flex flex-col items-start gap-2 self-start text-sm"
            >
              {t.formatMessage({
                defaultMessage:
                  "The agent didn't answer. Check your connection and try again.",
              })}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  watchdog.reset();
                  void resend().catch(() => watchdog.fail());
                }}
              >
                {t.formatMessage({ defaultMessage: "Try again" })}
              </Button>
            </li>
          )}
          {error && !failed && (
            // The agent's own message is English-only; this one is the
            // user's language.
            <li className="text-destructive self-start text-sm">
              {t.formatMessage({
                defaultMessage:
                  "Something went wrong with this answer. Please send it again.",
              })}
            </li>
          )}
        </ol>
        <div ref={bottom} />
      </div>

      <form onSubmit={onSubmit} className="border-t p-3">
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
        {credits.data?.nearReserve && (
          <p className="mb-2 text-xs text-amber-600">
            {t.formatMessage({
              defaultMessage:
                "Your credits are close to the reserve kept for your resume.",
            })}
          </p>
        )}
        {quote && (
          <div className="bg-muted/60 mb-2 flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs">
            <Quote className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              {agentTopic?.part && (
                <span className="text-muted-foreground block font-medium">
                  {partTitle(agentTopic.part)}
                </span>
              )}
              <span className="line-clamp-3 whitespace-pre-wrap">{quote}</span>
            </span>
            <button
              type="button"
              aria-label={t.formatMessage({
                defaultMessage: "Talk about the whole profile instead",
              })}
              onClick={clearAgentQuote}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <div className="bg-background flex flex-col rounded-xl border shadow-sm">
          <Textarea
            ref={input}
            rows={2}
            value={text}
            // The quote travels in the message: the two share its limit.
            maxLength={
              agentSettings.maxMessageCharacters - maxQuoteCharacters - 100
            }
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) onSubmit(event);
            }}
            placeholder={
              quote
                ? t.formatMessage({
                    defaultMessage: "What about this passage?",
                  })
                : t.formatMessage({
                    defaultMessage: "Tell what you did, or ask where to start",
                  })
            }
            className="max-h-40 resize-none border-0 shadow-none focus-visible:ring-0"
          />
          {/* Below the text, not over it: a long message scrolls clear of it. */}
          <div className="flex items-center gap-1 pr-2 pb-2 pl-3">
            <CreditCost credits={credits.data?.estimates.agentMessage} />
            {messages.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void send(interviewRequest)}
                className="text-muted-foreground hover:text-foreground mr-auto ml-2 text-xs underline-offset-2 hover:underline disabled:opacity-50"
              >
                {t.formatMessage({ defaultMessage: "Interview me" })}
              </button>
            )}
            <span className="mr-auto" />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={attachLabel}
              title={attachLabel}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip />
            </Button>
            <VoiceInputButton
              language={t.locale === "pt-BR" ? "pt-BR" : "en-US"}
              value={text}
              onValueChange={setText}
            />
            {busy ? (
              // Stops the answer being written; what was said so far stays.
              <Button
                type="button"
                size="icon"
                className="size-8 rounded-full"
                aria-label={t.formatMessage({ defaultMessage: "Stop" })}
                title={t.formatMessage({ defaultMessage: "Stop" })}
                onClick={() => void stop()}
              >
                <Square className="size-3 fill-current" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!text.trim()}
                className="size-8 rounded-full"
                aria-label={t.formatMessage({ defaultMessage: "Send" })}
              >
                <ArrowUp />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

/** The user's message: the passage it is about, where from, then their words. */
function UserMessage({
  message,
  partTitle,
}: {
  message: UIMessage;
  partTitle: (key: string | undefined) => string;
}) {
  const { quote, part, text } = splitAgentMessage(
    message.parts
      .flatMap((piece) => (piece.type === "text" ? [piece.text] : []))
      .join("")
  );
  const from = part ? partTitle(part) : "";
  return (
    <li className="bg-muted max-w-[90%] self-end rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap">
      {quote && (
        <span className="text-muted-foreground mb-1 block border-l-2 pl-2 text-xs">
          {from && <span className="block font-medium">{from}</span>}
          <span className="line-clamp-3">{quote}</span>
        </span>
      )}
      {text}
    </li>
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
      <Sparkles className="text-primary size-5" />
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

/**
 * The stored messages, then the local ones the store doesn't have yet (just
 * streamed, saved a moment later); an empty one the answer never filled
 * goes.
 */
function withStored(local: UIMessage[], stored: UIMessage[]) {
  const ids = new Set(stored.map((message) => message.id));
  return [
    ...stored,
    ...local.filter(
      (message) => !ids.has(message.id) && message.parts.length > 0
    ),
  ];
}
