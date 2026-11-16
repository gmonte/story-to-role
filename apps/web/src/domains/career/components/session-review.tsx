"use client";

import { useEffect, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";

import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { RunWatcher } from "~/domains/tasks/components/run-watcher";
import { useTRPC } from "~/tools/trpc/client";

import { useCareerLabels } from "../hooks/use-career-labels";
import { useTimeline } from "../hooks/use-career-queries";
import { ApprovalScreen } from "./approval-screen";
import { useCareerWorkspace } from "./career-workspace-context";

/**
 * What one position's (or credential's) interviewer found, to approve, in
 * the pane beside the chat: the conversation stays in view, the card under
 * review is marked on the side panel, and approving closes the pane.
 */
export function SessionReview() {
  const t = useTranslation();
  const labels = useCareerLabels();
  const timeline = useTimeline();
  const { activeSessionId, setActiveSessionId } = useCareerWorkspace();
  const session = useReviewedSession();
  const sessionId = activeSessionId ?? "";

  // Approved (the session closed): back to the conversation.
  const closed = !!session.data && session.data.status !== "open";
  useEffect(() => {
    if (closed) setActiveSessionId(null);
  }, [closed, setActiveSessionId]);
  if (!activeSessionId || closed) return null;

  const position = timeline.data?.positions.find(
    (candidate) => candidate.id === session.data?.positionId
  );
  const credential = timeline.data?.credentials.find(
    (candidate) => candidate.id === session.data?.credentialId
  );
  const title = position
    ? [position.title, position.employer].join(" · ")
    : (credential?.title ?? "");
  const detail = position
    ? labels.period(position.startDate, position.endDate)
    : credential
      ? labels.credentialKind(credential.kind)
      : "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-2">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">
            {t.formatMessage({ defaultMessage: "Reviewing" })}
          </p>
          <p className="truncate text-sm font-medium">{title}</p>
          {detail && (
            <p className="text-muted-foreground truncate text-xs">{detail}</p>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label={t.formatMessage({ defaultMessage: "Close the review" })}
          onClick={() => setActiveSessionId(null)}
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 px-6 pt-4">
          <Understanding sessionId={sessionId} />
        </div>
        {session.data && <ApprovalScreen session={session.data} />}
      </div>
    </div>
  );
}

/** The session under review. */
function useReviewedSession() {
  const trpc = useTRPC();
  const { activeSessionId } = useCareerWorkspace();
  return useQuery({
    ...trpc.interview.session.queryOptions({
      sessionId: activeSessionId ?? "",
    }),
    enabled: !!activeSessionId,
  });
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
