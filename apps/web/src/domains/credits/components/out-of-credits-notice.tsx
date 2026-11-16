"use client";

import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { useTranslation } from "@repo/intl/use-translation";
import { toast } from "@repo/web/components/ui/sonner";

type CreditsErrorData = {
  code?: string;
  credits?: { needed: number; available: number; stored: number } | null;
};

/**
 * When an action is refused for lack of credits, no AI call was made; the
 * user sees why and the way on (guided interview spec, guardrail 7: "the
 * app stops calling the AI and offers the subscription or a credit pack"),
 * or "Finish with credits" when their stored credits would cover it.
 */
export function OutOfCreditsNotice() {
  const t = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "error") return;
        const data = (event.action.error as { data?: CreditsErrorData }).data;
        if (data?.code !== "PAYMENT_REQUIRED") return;
        const credits = data.credits;
        const finish =
          !!credits && credits.available + credits.stored >= credits.needed;
        toast.warning(
          finish
            ? t.formatMessage({
                defaultMessage:
                  "Your plan’s credits ran out. Your stored credits can finish this.",
              })
            : t.formatMessage({
                defaultMessage:
                  "You’re out of credits for this. Subscribe for monthly credits, or buy a pack.",
              }),
          {
            id: "out-of-credits",
            action: {
              label: finish
                ? t.formatMessage({ defaultMessage: "Finish with credits" })
                : t.formatMessage({ defaultMessage: "See plans" }),
              onClick: () =>
                router.push(
                  finish ? "/app/billing#finish-with-credits" : "/app/billing"
                ),
            },
          }
        );
      }),
    [queryClient, router, t]
  );

  return null;
}
