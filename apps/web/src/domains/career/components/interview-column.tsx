"use client";

import { useEffect, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Sparkles } from "lucide-react";

import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { RunWatcher } from "~/domains/tasks/components/run-watcher";
import { useTRPC } from "~/tools/trpc/client";

import { useTimeline } from "../hooks/use-career-queries";
import { ApprovalScreen } from "./approval-screen";
import { CareerChat } from "./career-chat";
import { useCareerWorkspace } from "./career-workspace-context";
import { PrivacyNotice } from "./privacy-notice";

/**
 * The chat column of My career: the privacy notice first, then the one
 * career conversation, or the approval screen of a position under review.
 */
export function InterviewColumn() {
  const timeline = useTimeline();
  const { activeSessionId } = useCareerWorkspace();

  if (!timeline.data) return null;
  const { profile, positions } = timeline.data;

  if (!profile.privacyNoticeAccepted) {
    return <PrivacyNotice interviewLanguage={profile.interviewLanguage} />;
  }

  if (activeSessionId) return <SessionReview sessionId={activeSessionId} />;

  return (
    <CareerChat
      interviewLanguage={profile.interviewLanguage}
      hasPositions={positions.length > 0}
    />
  );
}

/** What one position's interviewer found, to approve, then back to the chat. */
function SessionReview({ sessionId }: { sessionId: string }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const { setActiveSessionId } = useCareerWorkspace();
  const session = useQuery(trpc.interview.session.queryOptions({ sessionId }));

  // Approved (the session closed): back to the conversation.
  const closed = !!session.data && session.data.status !== "open";
  useEffect(() => {
    if (closed) setActiveSessionId(null);
  }, [closed, setActiveSessionId]);
  if (closed) return null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 pt-4">
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          onClick={() => setActiveSessionId(null)}
        >
          <ArrowLeft />
          {t.formatMessage({ defaultMessage: "Back to the conversation" })}
        </Button>
        <Understanding sessionId={sessionId} />
      </div>
      {session.data && <ApprovalScreen session={session.data} />}
    </div>
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
