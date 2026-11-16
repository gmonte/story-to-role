"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { useChat } from "@ai-sdk/react";
import { useQuery } from "@tanstack/react-query";
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react";
import type { UIMessage } from "ai";
import { ArrowUp, FileUp, Plus, Sparkles } from "lucide-react";

import { careerAgentLabel } from "@repo/api/domains/career-chat/career-agent-label";
import type { careerChatAgent } from "@repo/api/domains/career-chat/tasks/career-chat-agent";
import { interviewSettings } from "@repo/api/domains/interview/interview-settings";
import type {
  InterviewLanguage,
  InterviewLanguageSource,
} from "@repo/api/domains/career/schemas/career";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Textarea } from "@repo/web/components/ui/textarea";
import { cn } from "@repo/web/lib/utils";

import {
  loadCareerChat,
  mintCareerChatToken,
  startCareerChatSession,
} from "../actions/career-chat-actions";
import { useRefreshCareer } from "../hooks/use-career-queries";
import { useCareerWorkspace } from "./career-workspace-context";
import { CareerLanguageBar } from "./career-language-bar";
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
  languageSource,
  hasPositions,
}: {
  interviewLanguage: InterviewLanguage;
  languageSource: InterviewLanguageSource | null;
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
      languageSource={languageSource}
      hasPositions={hasPositions}
    />
  );
}

function Conversation({
  chatId,
  initialMessages,
  session,
  interviewLanguage,
  languageSource,
  hasPositions,
}: {
  chatId: string;
  initialMessages: UIMessage[];
  session: { publicAccessToken: string; lastEventId?: string } | null;
  interviewLanguage: InterviewLanguage;
  languageSource: InterviewLanguageSource | null;
  hasPositions: boolean;
}) {
  const t = useTranslation();
  const refresh = useRefreshCareer();
  const { draft, setDraft } = useCareerWorkspace();
  const [working, setWorking] = useState<string[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  const transport = useTriggerChatTransport<typeof careerChatAgent>({
    task: "career_chat",
    accessToken: ({ chatId }) => mintCareerChatToken(chatId),
    startSession: ({ chatId }) => startCareerChatSession({ chatId }),
    // A session under way: reconnect to it instead of starting one.
    sessions: session ? { [chatId]: session } : undefined,
  });
  const { messages, sendMessage, status, error } = useChat({
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

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, working]);

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
    <div className="flex h-full flex-col">
      <CareerLanguageBar
        interviewLanguage={interviewLanguage}
        source={languageSource}
        started={messages.length > 0}
      />
      <div className="flex-1 overflow-y-auto">
        <ol className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
          {messages.length === 0 && <Introduction />}
          {messages.map((message) => {
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
              </li>
            );
          })}
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
            className="resize-none border-0 pr-24 shadow-none focus-visible:ring-0"
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
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
function Introduction() {
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
        <Button asChild size="sm" variant="outline">
          {/* The Sources input in the side panel. */}
          <label htmlFor="sources-upload-input" className="cursor-pointer">
            <FileUp />
            {t.formatMessage({
              defaultMessage: "Upload a resume, LinkedIn PDF or truth file",
            })}
          </label>
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
