"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

import { billingCatalog } from "@repo/api/domains/billing/billing-catalog";
import type { CheckoutProduct } from "@repo/api/domains/billing/schemas/billing";
import { creditSettings } from "@repo/api/domains/credits/credit-pricing";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

import { useCredits } from "~/domains/credits/hooks/use-credits";
import { useTRPC } from "~/tools/trpc/client";

/**
 * Plan and credits (billing spec): the subscription and credit packs
 * through Stripe Checkout, the Customer Portal to manage them, and what
 * the credits buy. Prices show in reais for the Brazilian interface and in
 * dollars otherwise; Checkout charges by the customer's country.
 */
export function BillingView() {
  const t = useTranslation();
  const trpc = useTRPC();
  const credits = useCredits();
  const status = useQuery(trpc.billing.status.queryOptions({}));
  const onError = (error: { message: string }) => toast.error(error.message);
  const redirect = ({ url }: { url: string }) => {
    window.location.assign(url);
  };
  const checkout = useMutation(
    trpc.billing.startCheckout.mutationOptions({ onSuccess: redirect, onError })
  );
  const portal = useMutation(
    trpc.billing.portal.mutationOptions({ onSuccess: redirect, onError })
  );

  const currency = t.locale === "pt-BR" ? "brl" : "usd";
  const price = (product: CheckoutProduct) =>
    t.formatNumber(billingCatalog.prices[product][currency] / 100, {
      style: "currency",
      currency: currency.toUpperCase(),
    });
  const subscription = status.data?.subscription;
  const subscribed = !!subscription && subscription.status !== "canceled";
  const busy = checkout.isPending || portal.isPending;
  const buy = (product: CheckoutProduct) => checkout.mutate({ product });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 overflow-y-auto p-6 text-sm">
      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">
            {t.formatMessage({ defaultMessage: "Your plan" })}
          </h2>
          {credits.data && (
            <Badge variant="outline">
              {
                {
                  free: t.formatMessage({ defaultMessage: "Free" }),
                  subscription: t.formatMessage({
                    defaultMessage: "Subscription",
                  }),
                  courtesy: t.formatMessage({ defaultMessage: "Courtesy" }),
                }[credits.data.plan]
              }
            </Badge>
          )}
        </div>
        {subscription && subscribed && (
          <p className="text-muted-foreground">
            {subscription.status === "past_due"
              ? t.formatMessage({
                  defaultMessage:
                    "Your last payment failed. Update your card to keep receiving monthly credits.",
                })
              : subscription.cancelAtPeriodEnd
                ? t.formatMessage(
                    {
                      defaultMessage:
                        "Cancelled: it ends on {date}, and you keep this month’s credits until then.",
                    },
                    {
                      date: t.formatDate(subscription.currentPeriodEnd, {
                        dateStyle: "medium",
                      }),
                    }
                  )
                : t.formatMessage(
                    { defaultMessage: "Renews on {date}." },
                    {
                      date: t.formatDate(subscription.currentPeriodEnd, {
                        dateStyle: "medium",
                      }),
                    }
                  )}
          </p>
        )}
        {status.data?.hasCustomer && (
          <Button
            variant="outline"
            className="self-start"
            disabled={busy}
            onClick={() => portal.mutate({})}
          >
            <ExternalLink />
            {t.formatMessage({
              defaultMessage: "Manage payments and subscription",
            })}
          </Button>
        )}
      </section>

      {!subscribed && (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">
            {t.formatMessage({ defaultMessage: "Subscription" })}
          </h2>
          <p className="text-muted-foreground">
            {t.formatMessage(
              {
                defaultMessage:
                  "{credits, number} credits every month for applying regularly: the full career interview, fit checks, resumes and cover letters. Monthly credits don’t roll over.",
              },
              { credits: creditSettings.subscriptionMonthlyCredits }
            )}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Offer
              title={t.formatMessage({ defaultMessage: "Monthly" })}
              price={t.formatMessage(
                { defaultMessage: "{price} a month" },
                { price: price("subscription_monthly") }
              )}
              action={t.formatMessage({ defaultMessage: "Subscribe" })}
              disabled={busy}
              onClick={() => buy("subscription_monthly")}
            />
            <Offer
              title={t.formatMessage({ defaultMessage: "Annual" })}
              price={t.formatMessage(
                { defaultMessage: "{price} a year" },
                { price: price("subscription_annual") }
              )}
              action={t.formatMessage({ defaultMessage: "Subscribe" })}
              disabled={busy}
              onClick={() => buy("subscription_annual")}
            />
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">
          {t.formatMessage({ defaultMessage: "Credit pack" })}
        </h2>
        <p className="text-muted-foreground">
          {t.formatMessage(
            {
              defaultMessage:
                "{credits, number} credits with no subscription, valid for {months, number} months. Pack credits cost more than the subscription’s.",
            },
            {
              credits: creditSettings.packCredits,
              months: creditSettings.packValidityMonths,
            }
          )}
        </p>
        <Offer
          title={t.formatMessage(
            { defaultMessage: "{credits, number} credits" },
            { credits: creditSettings.packCredits }
          )}
          price={price("pack")}
          action={t.formatMessage({ defaultMessage: "Buy" })}
          disabled={busy}
          onClick={() => buy("pack")}
        />
      </section>
    </div>
  );
}

function Offer({
  title,
  price,
  action,
  disabled,
  onClick,
}: {
  title: string;
  price: string;
  action: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
      <span className="flex flex-col">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">{price}</span>
      </span>
      <Button disabled={disabled} onClick={onClick}>
        {action}
      </Button>
    </div>
  );
}
