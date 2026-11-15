"use client";

import { useEffect } from "react";

import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { useTRPC } from "~/tools/trpc/client";

/**
 * The return from Checkout (billing spec): the session is confirmed with
 * Stripe and its credits granted right away, webhook or not.
 */
export function CheckoutReturn({
  checkoutSessionId,
}: {
  checkoutSessionId: string | null;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const complete = useMutation(trpc.billing.completeCheckout.mutationOptions());
  const { mutate } = complete;

  useEffect(() => {
    if (checkoutSessionId) mutate({ checkoutSessionId });
  }, [checkoutSessionId, mutate]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 p-6 text-sm">
      {complete.isPending || complete.isIdle ? (
        <p className="text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          {t.formatMessage({ defaultMessage: "Confirming your payment…" })}
        </p>
      ) : complete.isError ? (
        <p>
          {t.formatMessage({
            defaultMessage:
              "We couldn’t confirm this payment yet. If you were charged, your credits arrive within a few hours.",
          })}
        </p>
      ) : complete.data.paid ? (
        <p className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-green-600" />
          {complete.data.product === "pack"
            ? t.formatMessage({
                defaultMessage: "Payment confirmed: your credits are ready.",
              })
            : t.formatMessage({
                defaultMessage:
                  "Subscription confirmed: this month’s credits are ready.",
              })}
        </p>
      ) : (
        <p>
          {t.formatMessage({
            defaultMessage:
              "Your payment is still processing. Your credits arrive as soon as it completes.",
          })}
        </p>
      )}
      <Button asChild variant="outline">
        <Link href="/app/billing">
          {t.formatMessage({ defaultMessage: "Back to plan and credits" })}
        </Link>
      </Button>
    </div>
  );
}
