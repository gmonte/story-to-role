"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useCredits } from "../hooks/use-credits";

/**
 * "Finish with credits" (billing spec, funding order): on a paid plan,
 * stored credits wait for this confirmation; nothing switches to them by
 * itself.
 */
export function FinishWithCredits() {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const credits = useCredits();
  const confirm = useMutation(
    trpc.credits.confirmStoredCredits.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.credits.pathKey(),
        });
        toast.success(
          t.formatMessage({
            defaultMessage:
              "Done: your stored credits pay for the next task that needs them. Start it again to finish.",
          })
        );
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const locked = credits.data?.storedLocked ?? 0;
  const estimate = credits.data?.key?.stoppedTaskEstimate;
  if (locked <= 0) return null;

  return (
    <section
      id="finish-with-credits"
      className="bg-card flex flex-col gap-2 rounded-lg border p-4"
    >
      <h2 className="font-medium">
        {t.formatMessage({ defaultMessage: "Finish with credits" })}
      </h2>
      <p className="text-muted-foreground">
        {t.formatMessage(
          {
            defaultMessage:
              "You have {credits, number} stored credits (packs and welcome credits). They are used only after your plan’s credits and your own key, and only for a task you agree to.",
          },
          { credits: locked }
        )}
      </p>
      {estimate && (
        <p>
          {t.formatMessage(
            {
              defaultMessage:
                "Finishing what your key stopped costs up to {credits, number} credits.",
            },
            { credits: estimate }
          )}
        </p>
      )}
      <Button
        className="self-start"
        disabled={confirm.isPending}
        onClick={() => confirm.mutate({})}
      >
        {t.formatMessage({ defaultMessage: "Use my stored credits" })}
      </Button>
    </section>
  );
}
