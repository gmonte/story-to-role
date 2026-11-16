"use client";

import { useState, type FormEvent } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { ArrowUp, ListChecks } from "lucide-react";

import type { InterviewLanguage } from "@repo/api/domains/career/schemas/career";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";
import { cn } from "@repo/web/lib/utils";

import { useCredits } from "~/domains/credits/hooks/use-credits";
import { useTRPC } from "~/tools/trpc/client";

import { useCareerLabels } from "../hooks/use-career-labels";
import { useRefreshCareer } from "../hooks/use-career-queries";
import { ApprovalScreen } from "./approval-screen";
import { VoiceInputButton } from "./voice-input-button";

const MAX_MESSAGE = 4000;

/**
 * One interview session as a chat. Each message starts a task; the chat
 * follows the run live and reloads when the interviewer's reply is stored.
 */
export function InterviewChat({
  sessionId,
  interviewLanguage,
}: {
  sessionId: string;
  interviewLanguage: InterviewLanguage;
}) {
  const t = useTranslation();
  const labels = useCareerLabels();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = useRefreshCareer();
  const credits = useCredits();
  const [draft, setDraft] = useState("");
  const [pendingTurn, setPendingTurn] = useState<RealtimeSubscription>();

  const sessionQuery = trpc.interview.session.queryOptions({ sessionId });
  const session = useQuery(sessionQuery);
  const reload = () =>
    queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });

  const send = useMutation(
    trpc.interview.sendMessage.mutationOptions({
      onSuccess: ({ realtime }) => {
        setDraft("");
        setPendingTurn(realtime);
        void reload();
      },
      onError: (error) => {
        void reload();
        toast.error(error.message);
      },
    })
  );
  const proposeExtraction = useMutation(
    trpc.interview.proposeExtraction.mutationOptions({ onSuccess: reload })
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || pendingTurn) return;
    send.mutate({ sessionId, message: draft.trim() });
  }

  if (!session.data) return null;

  if (session.data.extractionProposed && !pendingTurn) {
    return (
      <div className="h-full overflow-y-auto">
        <ApprovalScreen session={session.data} />
        <div className="mx-auto max-w-3xl px-6 pb-6">
          <p className="text-muted-foreground text-sm">
            {t.formatMessage({
              defaultMessage:
                "Want to add more? Send a message and the interview continues.",
            })}
          </p>
        </div>
        {renderComposer()}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Badge variant="outline">{labels.stage(session.data.stage)}</Badge>
        {session.data.scriptKind === "short" && (
          <Badge variant="secondary">
            {t.formatMessage({ defaultMessage: "Highlights only" })}
          </Badge>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          disabled={proposeExtraction.isPending || !!pendingTurn}
          onClick={() => proposeExtraction.mutate({ sessionId })}
        >
          <ListChecks />
          {t.formatMessage({ defaultMessage: "I'm done with this position" })}
        </Button>
      </div>
      {credits.data?.nearReserve && (
        <p className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs">
          {t.formatMessage(
            {
              defaultMessage:
                "Your credits are close to the {credits, number} kept for your resume. The interviewer will wrap up this position with what you said; subscribing unlocks more.",
            },
            { credits: credits.data.reserve }
          )}
        </p>
      )}

      <div className="flex-1 overflow-y-auto">
        <ol className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
          {session.data.turns.length === 0 && !pendingTurn && (
            <li className="text-muted-foreground text-sm">
              {t.formatMessage({
                defaultMessage:
                  "Say hello, or start by telling what you did in this position. The interviewer asks one question at a time.",
              })}
            </li>
          )}
          {session.data.turns.map((turn) =>
            turn.kind === "checkpoint" ? (
              <li key={turn.id} className="rounded-lg border p-3 text-sm">
                <p>
                  {t.formatMessage({
                    defaultMessage:
                      "This session is getting long. Approve what you said so far and continue in a new session.",
                  })}
                </p>
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => proposeExtraction.mutate({ sessionId })}
                >
                  {t.formatMessage({
                    defaultMessage: "Review and approve",
                  })}
                </Button>
              </li>
            ) : (
              <li
                key={turn.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                  turn.role === "user" ? "bg-muted self-end" : "self-start",
                  turn.kind !== "text" && "text-muted-foreground italic"
                )}
              >
                {turn.content}
              </li>
            )
          )}
          {pendingTurn && (
            <PendingTurn
              key={pendingTurn.runId}
              {...pendingTurn}
              onDone={() => {
                setPendingTurn(undefined);
                void reload();
                void refresh();
              }}
            />
          )}
        </ol>
      </div>
      {renderComposer()}
    </div>
  );

  function renderComposer() {
    return (
      <form onSubmit={onSubmit} className="mx-auto w-full max-w-3xl p-4">
        <div className="bg-background relative rounded-xl border shadow-sm">
          <Textarea
            rows={2}
            value={draft}
            maxLength={MAX_MESSAGE}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) onSubmit(event);
            }}
            placeholder={t.formatMessage({ defaultMessage: "Your answer" })}
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
              disabled={!draft.trim() || send.isPending || !!pendingTurn}
              className="size-8 rounded-full"
              aria-label={t.formatMessage({ defaultMessage: "Send" })}
            >
              <ArrowUp />
            </Button>
          </div>
        </div>
      </form>
    );
  }
}

function PendingTurn({
  runId,
  accessToken,
  onDone,
}: RealtimeSubscription & { onDone: () => void }) {
  const t = useTranslation();
  useRealtimeRun(runId, { accessToken, onComplete: () => onDone() });

  return (
    <li className="text-muted-foreground animate-pulse self-start px-4 text-sm">
      {t.formatMessage({ defaultMessage: "Thinking…" })}
    </li>
  );
}
