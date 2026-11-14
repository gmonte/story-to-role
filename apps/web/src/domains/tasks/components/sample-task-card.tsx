"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

import {
  taskProgressSchema,
  type RealtimeSubscription,
} from "@repo/api/domains/tasks/schemas/task";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Progress } from "@repo/web/components/ui/progress";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

/**
 * Starts the sample task and follows its run live through Trigger.dev
 * Realtime: the proof that background tasks reach the browser.
 */
export function SampleTaskCard() {
  const t = useTranslation();
  const trpc = useTRPC();
  const [subscription, setSubscription] = useState<RealtimeSubscription>();

  const startSample = useMutation(
    trpc.tasks.startSample.mutationOptions({
      onSuccess: ({ realtime }) => setSubscription(realtime),
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="text-sm font-medium">
          {t.formatMessage({ defaultMessage: "Background tasks" })}
        </h2>
        <p className="text-muted-foreground text-xs">
          {t.formatMessage({
            defaultMessage:
              "Runs a sample task and shows its progress live. Visible outside production only.",
          })}
        </p>
      </div>
      {subscription && (
        <SampleTaskProgress key={subscription.runId} {...subscription} />
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={startSample.isPending}
        onClick={() => startSample.mutate({})}
      >
        {t.formatMessage({ defaultMessage: "Run sample task" })}
      </Button>
    </section>
  );
}

function SampleTaskProgress({ runId, accessToken }: RealtimeSubscription) {
  const t = useTranslation();
  const { run, error } = useRealtimeRun(runId, { accessToken });

  const progress = taskProgressSchema.safeParse(run?.metadata?.progress).data;
  const percent = progress ? (progress.step / progress.totalSteps) * 100 : 0;

  if (error) {
    return (
      <p className="text-destructive text-xs">
        {t.formatMessage({ defaultMessage: "Lost track of the task." })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Progress value={percent} />
      <p
        className="text-muted-foreground text-xs"
        data-testid="sample-task-status"
      >
        {run?.status === "COMPLETED"
          ? t.formatMessage({ defaultMessage: "Done." })
          : progress
            ? t.formatMessage(
                { defaultMessage: "Step {step} of {totalSteps}" },
                progress
              )
            : t.formatMessage({ defaultMessage: "Waiting for the worker…" })}
      </p>
    </div>
  );
}
