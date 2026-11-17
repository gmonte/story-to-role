"use client";

import { useEffect, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  FileText,
  Pencil,
  Quote,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import type { PositionView } from "@repo/api/domains/career/schemas/timeline";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/web/components/ui/tabs";
import { Textarea } from "@repo/web/components/ui/textarea";

import { RunWatcher } from "~/domains/tasks/components/run-watcher";
import { useTRPC } from "~/tools/trpc/client";

import { useCareerLabels } from "../hooks/use-career-labels";
import { useRefreshCareer, useTimeline } from "../hooks/use-career-queries";
import { ApprovalScreen } from "./approval-screen";
import {
  useCareerWorkspace,
  type PositionTab,
} from "./career-workspace-context";
import { InterviewChat } from "./interview-chat";

/**
 * A position's space, in the pane beside the chat: what the AI understood
 * and everything approved (facts with their sources, stories, skills, each
 * fact editable), what is left to review, and a chat with its own
 * interviewer. What the user does here reaches the general chat.
 */
export function PositionSpace() {
  const t = useTranslation();
  const labels = useCareerLabels();
  const timeline = useTimeline();
  const { openPosition, setOpenPosition } = useCareerWorkspace();
  const position = timeline.data?.positions.find(
    (candidate) => candidate.id === openPosition?.positionId
  );
  // A position merged or removed while open closes its space.
  if (!openPosition || !position) return null;
  const setTab = (tab: string) =>
    setOpenPosition({ ...openPosition, tab: tab as PositionTab });

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
          onClick={() => setOpenPosition(null)}
        >
          <X />
        </Button>
      </div>
      <Tabs
        value={openPosition.tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-4 mt-2">
          <TabsTrigger value="overview">
            {t.formatMessage({ defaultMessage: "Overview" })}
          </TabsTrigger>
          <TabsTrigger value="facts">
            {t.formatMessage({ defaultMessage: "Facts" })}
          </TabsTrigger>
          {position.draftsToReview > 0 && (
            <TabsTrigger value="review">
              {t.formatMessage(
                { defaultMessage: "Review ({count, number})" },
                { count: position.draftsToReview }
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="chat">
            {t.formatMessage({ defaultMessage: "Chat" })}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="min-h-0 overflow-y-auto">
          <Overview position={position} />
        </TabsContent>
        <TabsContent value="facts" className="min-h-0 overflow-y-auto">
          <Facts positionId={position.id} />
        </TabsContent>
        <TabsContent value="review" className="min-h-0 overflow-y-auto">
          <Review position={position} />
        </TabsContent>
        <TabsContent value="chat" className="min-h-0 flex-1">
          <PositionChat
            positionId={position.id}
            interviewLanguage={timeline.data!.profile.interviewLanguage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** What the AI understood, once approved, and how far the story goes. */
function Overview({ position }: { position: PositionView }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const detail = useQuery(
    trpc.career.positionDetail.queryOptions({ positionId: position.id })
  );
  const { counts } = position.depth;
  return (
    <div className="flex flex-col gap-4 p-4">
      <section className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="text-primary size-4" />
          {t.formatMessage({ defaultMessage: "What I understood" })}
        </h2>
        <p className="text-sm whitespace-pre-wrap">
          {detail.data?.summary ??
            t.formatMessage({
              defaultMessage:
                "The summary is written once this position is approved.",
            })}
        </p>
      </section>
      <p className="text-muted-foreground text-sm">
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
      {position.depth.nudge && !position.depth.done && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {t.formatMessage(
            {
              defaultMessage:
                "{count, plural, =0 {Every achievement has a number.} one {# achievement still has no number.} other {# achievements still have no number.}}",
            },
            { count: position.depth.nudge.count }
          )}
        </p>
      )}
    </div>
  );
}

/** Everything approved: facts (editable), stories and skills. */
function Facts({ positionId }: { positionId: string }) {
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
  if (facts.length === 0 && stories.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        {t.formatMessage({
          defaultMessage:
            "Nothing approved yet. Review what was found, or tell more in the chat.",
        })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
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
                  t.formatMessage({ defaultMessage: "Told in a conversation" })}
              </span>
            </span>
          </div>
        </div>
      ))}
      {stories.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            {t.formatMessage({ defaultMessage: "Stories" })}
          </h3>
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
          <h3 className="text-sm font-medium">
            {t.formatMessage({ defaultMessage: "Skills" })}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <Badge key={skill} variant="outline">
                {skill}
              </Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** What was found and not yet approved, with what the AI understood of it. */
function Review({ position }: { position: PositionView }) {
  const trpc = useTRPC();
  const openSessions = useQuery(trpc.interview.openSessions.queryOptions({}));
  const sessionId = openSessions.data?.find(
    (candidate) => candidate.positionId === position.id
  )?.sessionId;
  const session = useQuery({
    ...trpc.interview.session.queryOptions({ sessionId: sessionId ?? "" }),
    enabled: !!sessionId,
  });
  if (!sessionId || position.draftsToReview === 0) return null;
  return (
    <div>
      <div className="flex flex-col gap-4 px-4 pt-4">
        <Understanding sessionId={sessionId} />
      </div>
      {session.data?.status === "open" && (
        <ApprovalScreen session={session.data} />
      )}
    </div>
  );
}

/**
 * A chat with this position's own interviewer (the one behind the general
 * chat), charged as a chat message; what is told here reaches the general
 * chat too.
 */
function PositionChat({
  positionId,
  interviewLanguage,
}: {
  positionId: string;
  interviewLanguage: Parameters<typeof InterviewChat>[0]["interviewLanguage"];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const openSessions = useQuery(trpc.interview.openSessions.queryOptions({}));
  const sessionId = openSessions.data?.find(
    (candidate) => candidate.positionId === positionId
  )?.sessionId;
  const { mutate: openSession } = useMutation(
    trpc.interview.openSession.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.interview.openSessions.queryKey(),
        }),
      onError: (error) => toast.error(error.message),
    })
  );
  // The position's session, opened the first time its chat is shown.
  const asked = useRef(false);
  useEffect(() => {
    if (!openSessions.data || sessionId || asked.current) return;
    asked.current = true;
    openSession({ positionId });
  }, [openSessions.data, sessionId, openSession, positionId]);

  if (!sessionId) return null;
  return (
    <InterviewChat
      sessionId={sessionId}
      interviewLanguage={interviewLanguage}
    />
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
