"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { useChat } from "@ai-sdk/react";
import { useQuery } from "@tanstack/react-query";
import {
  useChatActions,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react";
import type { UIMessage } from "ai";
import { ArrowUp, FileUp, Paperclip, Plus, Sparkles } from "lucide-react";

import { careerAgentLabel } from "@repo/api/domains/career-chat/career-agent-label";
import type { careerChatAgent } from "@repo/api/domains/career-chat/tasks/career-chat-agent";
import { interviewSettings } from "@repo/api/domains/interview/interview-settings";
import type { InterviewLanguage } from "@repo/api/domains/career/schemas/career";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Textarea } from "@repo/web/components/ui/textarea";
import { cn } from "@repo/web/lib/utils";

import {
  loadCareerChat,
  mintCareerChatToken,
  startCareerChatSession,
} from "../actions/career-chat-actions";
import { useRefreshCareer, useTimeline } from "../hooks/use-career-queries";
import { sourceAccept, useSourceUpload } from "../hooks/use-source-upload";
import { ApproveImportedButton } from "./approve-imported-button";
import { useCareerWorkspace } from "./career-workspace-context";
import { ImportProgress } from "./import-progress";
import { PositionFormDialog } from "./position-form-dialog";
import { VoiceInputButton } from "./voice-input-button";

/**
 * My career as one conversation (guided-interview spec, "one
 * conversation"). Behind it an orchestrator hands each message to the
 * interviewer of every position it concerns; the reply streams in as it is
 * written, and the interviewers at work show while they work.
 */
export function CareerChat({
  interviewLanguage,
  hasPositions,
}: {
  interviewLanguage: InterviewLanguage;
  hasPositions: boolean;
}) {
  const loaded = useQuery({
    queryKey: ["career-chat"],
    queryFn: () => loadCareerChat(),
    staleTime: Infinity,
  });
  if (!loaded.data) return null;
  return (
    <Conversation
      key={loaded.data.chatId}
      chatId={loaded.data.chatId}
      initialMessages={loaded.data.messages}
      session={loaded.data.session}
      interviewLanguage={interviewLanguage}
      hasPositions={hasPositions}
    />
  );
}

function Conversation({
  chatId,
  initialMessages,
  session,
  interviewLanguage,
  hasPositions,
}: {
  chatId: string;
  initialMessages: UIMessage[];
  session: { publicAccessToken: string; lastEventId?: string } | null;
  interviewLanguage: InterviewLanguage;
  hasPositions: boolean;
}) {
  const t = useTranslation();
  const refresh = useRefreshCareer();
  const timeline = useTimeline();
  const { draft, setDraft, imports, startImport, finishImport } =
    useCareerWorkspace();
  const [working, setWorking] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const documents = timeline.data?.documents ?? [];
  const positions = timeline.data?.positions ?? [];
  // Files go to the same Sources as the side panel's.
  const { add } = useSourceUpload({ documents, onStarted: startImport });

  const transport = useTriggerChatTransport<typeof careerChatAgent>({
    task: "career_chat",
    accessToken: ({ chatId }) => mintCareerChatToken(chatId),
    startSession: ({ chatId }) => startCareerChatSession({ chatId }),
    // A session under way: reconnect to it instead of starting one.
    sessions: session ? { [chatId]: session } : undefined,
  });
  const { messages, sendMessage, setMessages, status, error } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    resume: initialMessages.length > 0,
    onData: (part) => {
      if (part.type === "data-agents") {
        setWorking((part.data as { working: string[] }).working);
      }
    },
    // The interviewers saved drafts and proposals: the panel catches up.
    onFinish: () => {
      setWorking([]);
      void refresh();
    },
  });
  const busy = status === "submitted" || status === "streaming";
  const { sendAction } = useChatActions({ sendMessage });

  // An import ended (here or while the page was away): the chat says what
  // it found. The reaction was written by the import; saying it is free.
  const reactionPending = documents.some(
    (document) => document.reactionPending
  );
  const asking = useRef(false);
  useEffect(() => {
    if (!reactionPending || busy || asking.current) return;
    asking.current = true;
    // The answer to a request without a message continues the last
    // assistant message: an empty one takes it, so earlier ones stay. The
    // stored transcript then replaces the local one.
    setMessages((current) => [
      ...current,
      { id: `reaction-${Date.now()}`, role: "assistant", parts: [] },
    ]);
    void sendAction({ type: "say_import_reactions" })
      .then(async () => setMessages((await loadCareerChat()).messages))
      .finally(() => {
        asking.current = false;
        void refresh();
      });
  }, [reactionPending, busy, sendAction, setMessages, refresh]);
  const lastReview = messages.findLastIndex((message) =>
    message.parts.some((part) => part.type === "data-import-review")
  );

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, working, imports]);

  function send(text: string) {
    if (!text.trim() || busy) return;
    void sendMessage({ text: text.trim() });
    setDraft("");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    send(draft);
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col transition-colors",
        dragging && "bg-primary/5"
      )}
      // Files dropped anywhere on the conversation are imported.
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        add(Array.from(event.dataTransfer.files));
      }}
    >
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
      <div className="flex-1 overflow-y-auto">
        <ol className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
          {messages.length === 0 && (
            <Introduction onUpload={() => fileInput.current?.click()} />
          )}
          {messages.map((message, index) => {
            const text = message.parts
              .flatMap((part) => (part.type === "text" ? [part.text] : []))
              .join("");
            if (!text) return null;
            return (
              <li
                key={message.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                  message.role === "user" ? "bg-muted self-end" : "self-start"
                )}
              >
                {text}
                {/* The import's shortcut, offered where the chat raised it. */}
                {index === lastReview && (
                  <div className="mt-3 whitespace-normal">
                    <ApproveImportedButton positions={positions} />
                  </div>
                )}
              </li>
            );
          })}
          {imports.map((run) => (
            <li key={run.runId} className="w-full max-w-md self-start">
              <ImportProgress
                {...run}
                onDone={() => {
                  finishImport(run.runId);
                  void refresh();
                }}
              />
            </li>
          ))}
          {busy && <AiAtWork working={working} />}
          {error && (
            // The agent's own message is English-only; this one is the
            // user's language.
            <li className="text-destructive self-start px-4 text-sm">
              {t.formatMessage({
                defaultMessage:
                  "Something went wrong with this answer. Please send it again.",
              })}
            </li>
          )}
        </ol>
        <div ref={bottom} />
      </div>

      <form onSubmit={onSubmit} className="mx-auto w-full max-w-3xl p-4">
        {!hasPositions && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mb-2"
            disabled={busy}
            onClick={() =>
              send(
                t.formatMessage({ defaultMessage: "I have no positions yet." })
              )
            }
          >
            {t.formatMessage({ defaultMessage: "I have no positions yet" })}
          </Button>
        )}
        <div className="bg-background relative rounded-xl border shadow-sm">
          <Textarea
            rows={2}
            value={draft}
            maxLength={interviewSettings.maxMessageCharacters}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) onSubmit(event);
            }}
            placeholder={t.formatMessage({
              defaultMessage: "Tell what you did, or ask where to start",
            })}
            className="resize-none border-0 pr-32 shadow-none focus-visible:ring-0"
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={t.formatMessage({
                defaultMessage: "Attach a resume or a text file",
              })}
              title={t.formatMessage({
                defaultMessage: "Attach a resume or a text file",
              })}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip />
            </Button>
            <VoiceInputButton
              language={interviewLanguage}
              value={draft}
              onValueChange={setDraft}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!draft.trim() || busy}
              className="size-8 rounded-full"
              aria-label={t.formatMessage({ defaultMessage: "Send" })}
            >
              <ArrowUp />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

/** The empty conversation: what the interview does and where to begin. */
function Introduction({ onUpload }: { onUpload: () => void }) {
  const t = useTranslation();
  return (
    <li className="mx-auto flex max-w-md flex-col items-center gap-4 py-10 text-center">
      <h2 className="font-display text-2xl font-semibold tracking-tight">
        {t.formatMessage({ defaultMessage: "Your career story" })}
      </h2>
      <p className="text-muted-foreground text-sm">
        {t.formatMessage({
          defaultMessage:
            "Tell your career in your own words, about any position, in any order. Each position has its own interviewer behind this chat, and what you say becomes evidence you approve.",
        })}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="sm" variant="outline" onClick={onUpload}>
          <FileUp />
          {t.formatMessage({
            defaultMessage: "Upload a resume, your LinkedIn PDF or a text file",
          })}
        </Button>
        <PositionFormDialog
          trigger={
            <Button size="sm" variant="outline">
              <Plus />
              {t.formatMessage({ defaultMessage: "Add a position" })}
            </Button>
          }
        />
      </div>
    </li>
  );
}

/** The AI at work: which interviewers are on it, live, never a still label. */
function AiAtWork({ working }: { working: string[] }) {
  const t = useTranslation();
  return (
    <li className="text-muted-foreground flex items-center gap-2 self-start px-4 text-sm">
      <Sparkles className="text-primary size-4 animate-pulse" />
      <span className="animate-pulse">
        {working.length > 0
          ? t.formatMessage(
              {
                defaultMessage:
                  "{count, plural, =0 {Thinking…} one {# interviewer working: {names}} other {# interviewers working: {names}}}",
              },
              {
                count: working.length,
                names: working
                  .map((name) =>
                    name === careerAgentLabel
                      ? t.formatMessage({ defaultMessage: "your career" })
                      : name
                  )
                  .join(", "),
              }
            )
          : t.formatMessage({ defaultMessage: "Thinking…" })}
      </span>
    </li>
  );
}
