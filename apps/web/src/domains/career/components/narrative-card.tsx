"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

import type { Timeline } from "@repo/api/domains/career/schemas/timeline";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

import { AiAtWork } from "~/domains/workspace/components/ai-at-work";
import { useTRPC } from "~/tools/trpc/client";

import { useRefreshCareer } from "../hooks/use-career-queries";

/** The links between approved positions, drafted on request and approved. */
export function NarrativeCard({
  narrative,
  hasApprovedPositions,
}: {
  narrative: Timeline["narrative"];
  hasApprovedPositions: boolean;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const [running, setRunning] = useState<RealtimeSubscription>();
  const onError = (error: { message: string }) => toast.error(error.message);

  const draft = useMutation(
    trpc.career.requestNarrative.mutationOptions({
      onSuccess: ({ realtime }) => setRunning(realtime),
      onError,
    })
  );
  const approve = useMutation(
    trpc.career.approveNarrative.mutationOptions({
      onSuccess: refresh,
      onError,
    })
  );

  if (!hasApprovedPositions) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {t.formatMessage({ defaultMessage: "Career narrative" })}
      </h3>
      {narrative && (
        <div className="bg-background flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-sm whitespace-pre-wrap">{narrative.text}</p>
          <div className="flex flex-wrap gap-1">
            {narrative.themes.map((theme) => (
              <Badge key={theme} variant="secondary">
                {theme}
              </Badge>
            ))}
          </div>
          {!narrative.approved && (
            <Button
              size="sm"
              onClick={() => approve.mutate({ narrativeId: narrative.id })}
            >
              {t.formatMessage({ defaultMessage: "Approve narrative" })}
            </Button>
          )}
        </div>
      )}
      {running && (
        <>
          <AiAtWork
            title={t.formatMessage({
              defaultMessage: "Drafting the story that links your positions",
            })}
          />
          <NarrativeRun
            {...running}
            onDone={() => {
              setRunning(undefined);
              void refresh();
            }}
          />
        </>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={draft.isPending || !!running}
        onClick={() => draft.mutate({})}
      >
        {narrative
          ? t.formatMessage({ defaultMessage: "Draft again" })
          : t.formatMessage({ defaultMessage: "Draft my narrative" })}
      </Button>
    </section>
  );
}

function NarrativeRun({
  runId,
  accessToken,
  onDone,
}: RealtimeSubscription & { onDone: () => void }) {
  useRealtimeRun(runId, { accessToken, onComplete: () => onDone() });
  return null;
}
