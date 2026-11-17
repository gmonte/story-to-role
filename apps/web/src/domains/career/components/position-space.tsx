"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import {
  ArrowUp,
  Check,
  FileText,
  Hash,
  Pencil,
  Quote,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import type { PositionView } from "@repo/api/domains/career/schemas/timeline";
import { interviewSettings } from "@repo/api/domains/interview/interview-settings";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";
import { cn } from "@repo/web/lib/utils";

import { RunWatcher } from "~/domains/tasks/components/run-watcher";
import { useTRPC } from "~/tools/trpc/client";

import { useCareerLabels } from "../hooks/use-career-labels";
import { useRefreshCareer, useTimeline } from "../hooks/use-career-queries";
import { ApprovalScreen } from "./approval-screen";
import { useCareerWorkspace } from "./career-workspace-context";

/**
 * A position's space, in the pane beside the chat, as one page: what the AI
 * understood, what is left to review, the approved facts (each editable,
 * each achievement without a number one click from adding it), its stories
 * and skills, and the conversation with its interviewer, the messages the
 * career chat relayed included. The user can talk to it here directly;
 * the general chat hears of it.
 */
export function PositionSpace() {
  const t = useTranslation();
  const labels = useCareerLabels();
  const trpc = useTRPC();
  const timeline = useTimeline();
  const { openPositionId, setOpenPositionId } = useCareerWorkspace();
  const [draft, setDraft] = useState("");
  const composer = useRef<HTMLTextAreaElement>(null);
  const position = timeline.data?.positions.find(
    (candidate) => candidate.id === openPositionId
  );
  const openSessions = useQuery(trpc.interview.openSessions.queryOptions({}));
  const sessionId = openSessions.data?.find(
    (candidate) => candidate.positionId === position?.id
  )?.sessionId;

  // A position merged or removed while open closes its space.
  if (!openPositionId || !position) return null;

  const ask = (text: string) => {
    setDraft(text);
    composer.current?.focus();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {[position.title, position.employer].join(" · ")}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {labels.period(position.startDate, position.endDate)}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label={t.formatMessage({
            defaultMessage: "Close this position",
          })}
          onClick={() => setOpenPositionId(null)}
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-6 p-4">
          <Summary position={position} />
          {sessionId && position.draftsToReview > 0 && (
            <Review sessionId={sessionId} />
          )}
          <Facts positionId={position.id} onAddNumber={ask} />
          {sessionId && <Conversation sessionId={sessionId} />}
        </div>
      </div>
      <Composer
        positionId={position.id}
        sessionId={sessionId}
        draft={draft}
        setDraft={setDraft}
        textarea={composer}
      />
    </div>
  );
}

/** What the AI understood, once approved, and how far the story goes. */
function Summary({ position }: { position: PositionView }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const detail = useQuery(
    trpc.career.positionDetail.queryOptions({ positionId: position.id })
  );
  const { counts } = position.depth;
  const summary = detail.data?.summary;
  return (
    <section
      className={cn(
        "flex flex-col gap-2",
        summary && "bg-muted/40 rounded-lg border p-4"
      )}
    >
      {/* Written once the position is approved; before, the review below
          says what was understood. */}
      {summary && (
        <>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="text-primary size-4" />
            {t.formatMessage({ defaultMessage: "What I understood" })}
          </h2>
          <p className="text-sm whitespace-pre-wrap">{summary}</p>
        </>
      )}
      <p className="text-muted-foreground text-xs">
        {t.formatMessage(
          {
            defaultMessage:
              "{facts, plural, =0 {No approved facts} one {# approved fact} other {# approved facts}}, {numbers, plural, =0 {none with numbers} one {# with numbers} other {# with numbers}}, {stories, plural, =0 {no stories} one {# story} other {# stories}}.",
          },
          {
            facts: counts.evidence,
            numbers: counts.resultsWithNumbers,
            stories: counts.stories,
          }
        )}
      </p>
    </section>
  );
}

/** What was found and not yet approved, with what the AI understood of it. */
function Review({ sessionId }: { sessionId: string }) {
  const trpc = useTRPC();
  const session = useQuery(trpc.interview.session.queryOptions({ sessionId }));
  return (
    <section className="flex flex-col gap-3">
      <Understanding sessionId={sessionId} />
      {session.data?.status === "open" && (
        <div className="-mx-6">
          <ApprovalScreen session={session.data} />
        </div>
      )}
    </section>
  );
}

// An achievement with no figure in it: the place a number would help most.
const lacksNumber = (fact: { kind: string; text: string }) =>
  fact.kind === "achievement" && !/\d/.test(fact.text);

/**
 * Everything approved: facts (editable; an achievement without a number
 * offers to add one in the conversation), stories and skills.
 */
function Facts({
  positionId,
  onAddNumber,
}: {
  positionId: string;
  onAddNumber: (text: string) => void;
}) {
  const t = useTranslation();
  const labels = useCareerLabels();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const queryClient = useQueryClient();
  const query = trpc.career.positionDetail.queryOptions({ positionId });
  const detail = useQuery(query);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(
    null
  );
  const done = async () => {
    setEditing(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: query.queryKey }),
      refresh(),
    ]);
  };
  const onError = (error: { message: string }) => toast.error(error.message);
  const update = useMutation(
    trpc.career.updateFact.mutationOptions({ onSuccess: done, onError })
  );
  const remove = useMutation(
    trpc.career.removeFact.mutationOptions({ onSuccess: done, onError })
  );

  if (!detail.data) return null;
  const { facts, stories, skills } = detail.data;
  if (facts.length === 0 && stories.length === 0) return null;

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">
          {t.formatMessage({ defaultMessage: "Approved facts" })}
        </h2>
        {facts.map((fact) => (
          <div
            key={fact.id}
            className="bg-background flex flex-col gap-2 rounded-lg border p-3"
          >
            <div className="flex items-start gap-2">
              <Badge variant="secondary">{labels.draftKind(fact.kind)}</Badge>
              <div className="ml-auto flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={t.formatMessage({
                    defaultMessage: "Edit this fact",
                  })}
                  onClick={() => setEditing({ id: fact.id, text: fact.text })}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={t.formatMessage({
                    defaultMessage: "Remove this fact",
                  })}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ evidenceId: fact.id })}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            {editing?.id === fact.id ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  value={editing.text}
                  onChange={(event) =>
                    setEditing({ id: fact.id, text: event.target.value })
                  }
                />
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    disabled={!editing.text.trim() || update.isPending}
                    onClick={() =>
                      update.mutate({
                        evidenceId: fact.id,
                        text: editing.text.trim(),
                      })
                    }
                  >
                    <Check />
                    {t.formatMessage({ defaultMessage: "Save" })}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(null)}
                  >
                    {t.formatMessage({ defaultMessage: "Cancel" })}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm">{fact.text}</p>
            )}
            {/* Where it came from: a file's passage or the user's words. */}
            <div className="bg-muted/50 text-muted-foreground flex gap-2 rounded-md p-2 text-xs">
              {fact.fileName ? (
                <FileText className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <Quote className="mt-0.5 size-3.5 shrink-0" />
              )}
              <span>
                <span className="italic">{fact.quote}</span>
                <span className="block pt-1 not-italic">
                  {fact.fileName ??
                    t.formatMessage({
                      defaultMessage: "Told in a conversation",
                    })}
                </span>
              </span>
            </div>
            {lacksNumber(fact) && (
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() =>
                  onAddNumber(
                    t.formatMessage(
                      {
                        defaultMessage: "About “{fact}”: the result was ",
                      },
                      { fact: fact.text }
                    )
                  )
                }
              >
                <Hash />
                {t.formatMessage({ defaultMessage: "Add a number" })}
              </Button>
            )}
          </div>
        ))}
      </section>
      {stories.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">
            {t.formatMessage({ defaultMessage: "Stories" })}
          </h2>
          {stories.map((story) => (
            <div key={story.id} className="rounded-lg border p-3 text-sm">
              <p>{story.problem}</p>
              <p className="text-muted-foreground">{story.action}</p>
              <p>{story.result}</p>
            </div>
          ))}
        </section>
      )}
      {skills.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">
            {t.formatMessage({ defaultMessage: "Skills" })}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <Badge key={skill} variant="outline">
                {skill}
              </Badge>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/**
 * The conversation with this position's interviewer: what the user told it
 * here, and what the career chat relayed to it and heard back (the agents'
 * own exchange), each marked.
 */
function Conversation({ sessionId }: { sessionId: string }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const session = useQuery(trpc.interview.session.queryOptions({ sessionId }));
  const turns = (session.data?.turns ?? []).filter(
    (turn) => turn.kind === "text" && turn.content
  );
  if (turns.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">
        {t.formatMessage({
          defaultMessage: "Conversation with the interviewer",
        })}
      </h2>
      <ol className="flex flex-col gap-3">
        {turns.map((turn) => (
          <li
            key={turn.id}
            className={cn(
              "flex max-w-[90%] flex-col gap-1",
              turn.role === "user" ? "items-end self-end" : "self-start"
            )}
          >
            <span className="text-muted-foreground text-xs">
              {turn.role === "user"
                ? turn.via === "career_chat"
                  ? t.formatMessage({
                      defaultMessage: "You, in the general chat",
                    })
                  : t.formatMessage({ defaultMessage: "You" })
                : turn.via === "career_chat"
                  ? t.formatMessage({
                      defaultMessage: "Interviewer, to the general chat",
                    })
                  : t.formatMessage({ defaultMessage: "Interviewer" })}
            </span>
            <p
              className={cn(
                "rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                turn.role === "user" ? "bg-muted" : "border",
                turn.via === "career_chat" && "opacity-80"
              )}
            >
              {turn.content}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Talks to this position's interviewer directly (a chat message's price);
 * the reply lands in the conversation above and the general chat hears of
 * it. The session opens with the first message.
 */
function Composer({
  positionId,
  sessionId,
  draft,
  setDraft,
  textarea,
}: {
  positionId: string;
  sessionId: string | undefined;
  draft: string;
  setDraft: (draft: string) => void;
  textarea: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = useRefreshCareer();
  const [pending, setPending] = useState<RealtimeSubscription | null>(null);
  const onError = (error: { message: string }) => toast.error(error.message);
  const openSession = useMutation(
    trpc.interview.openSession.mutationOptions({ onError })
  );
  const send = useMutation(
    trpc.interview.sendMessage.mutationOptions({
      onSuccess: ({ realtime }) => {
        setDraft("");
        setPending(realtime);
        void queryClient.invalidateQueries({
          queryKey: trpc.interview.session.queryKey(),
        });
      },
      onError,
    })
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || pending) return;
    const id =
      sessionId ?? (await openSession.mutateAsync({ positionId })).sessionId;
    send.mutate({ sessionId: id, message });
  }

  return (
    <form onSubmit={onSubmit} className="border-t p-3">
      {pending && (
        <TurnWatcher
          {...pending}
          onDone={async () => {
            setPending(null);
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: trpc.interview.openSessions.queryKey(),
              }),
              queryClient.invalidateQueries({
                queryKey: trpc.interview.session.queryKey(),
              }),
              refresh(),
            ]);
          }}
        />
      )}
      <div className="bg-background relative rounded-xl border">
        <Textarea
          ref={textarea}
          rows={2}
          value={draft}
          maxLength={interviewSettings.maxMessageCharacters}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) void onSubmit(event);
          }}
          placeholder={t.formatMessage({
            defaultMessage: "Tell this position's interviewer more",
          })}
          className="resize-none border-0 pr-12 shadow-none focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!draft.trim() || !!pending || send.isPending}
          className="absolute right-2 bottom-2 size-8 rounded-full"
          aria-label={t.formatMessage({ defaultMessage: "Send" })}
        >
          <ArrowUp />
        </Button>
      </div>
    </form>
  );
}

/** The interviewer at work on the last message, until its reply is stored. */
function TurnWatcher({
  runId,
  accessToken,
  onDone,
}: RealtimeSubscription & { onDone: () => void }) {
  const t = useTranslation();
  useRealtimeRun(runId, { accessToken, onComplete: onDone });
  return (
    <p className="text-muted-foreground mb-2 flex animate-pulse items-center gap-2 text-xs">
      <Sparkles className="text-primary size-3.5" />
      {t.formatMessage({ defaultMessage: "The interviewer is thinking…" })}
    </p>
  );
}

/**
 * "What I understood": the interviewer's own summary of the drafts, written
 * when it's missing or no longer covers every draft, with the AI shown at
 * work meanwhile.
 */
function Understanding({ sessionId }: { sessionId: string }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const query = trpc.interview.understanding.queryOptions({ sessionId });
  const understanding = useQuery(query);
  const [running, setRunning] = useState<RealtimeSubscription | null>(null);
  const requested = useRef(false);
  const {
    mutate: understand,
    isPending,
    isError,
  } = useMutation(
    trpc.interview.understand.mutationOptions({
      onSuccess: ({ realtime }) => setRunning(realtime),
    })
  );

  const data = understanding.data;
  const stale = !!data && !data.current && data.pendingDrafts > 0;
  // Written once per visit when missing or stale.
  useEffect(() => {
    if (stale && !requested.current) {
      requested.current = true;
      understand({ sessionId });
    }
  }, [stale, understand, sessionId]);

  if (!data || data.pendingDrafts === 0) return null;
  // A failed start (out of credits, already writing) stops the waiting.
  const writing = !!running || isPending || (stale && !data.text && !isError);

  return (
    <section className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="text-primary size-4" />
        {t.formatMessage({ defaultMessage: "What I understood" })}
      </h2>
      {writing && (
        <p className="text-muted-foreground animate-pulse text-sm">
          {t.formatMessage({
            defaultMessage:
              "Reading back what you told me about this position…",
          })}
        </p>
      )}
      {!writing && data.text && (
        <p className="text-sm whitespace-pre-wrap">{data.text}</p>
      )}
      {running && (
        <RunWatcher
          {...running}
          onDone={() => {
            setRunning(null);
            void queryClient.invalidateQueries({ queryKey: query.queryKey });
          }}
        />
      )}
    </section>
  );
}
