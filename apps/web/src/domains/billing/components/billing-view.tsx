"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarSync, ExternalLink, ReceiptText } from "lucide-react";
import Link from "next/link";

import { billingCatalog } from "@repo/api/domains/billing/billing-catalog";
import {
  type CheckoutProduct,
  isLiveSubscription,
} from "@repo/api/domains/billing/schemas/billing";
import { creditSettings } from "@repo/api/domains/credits/credit-pricing";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/web/components/ui/dialog";
import { toast } from "@repo/web/components/ui/sonner";

import { FinishWithCredits } from "~/domains/credits/components/finish-with-credits";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { useTRPC } from "~/tools/trpc/client";

import { OwnKeyOffer } from "./own-key-offer";
import { OwnKeySection } from "./own-key-section";

/**
 * Plan and credits (billing spec): the credit and own-key subscriptions
 * and credit packs through Stripe Checkout, the switches between plans
 * ("Switching plans"), the Customer Portal for card, invoices and
 * cancelling, and what the credits buy. Prices show in reais for the
 * Brazilian interface and in dollars otherwise; Checkout charges by the
 * customer's country.
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
  const changeInterval = useMutation(
    trpc.billing.changeInterval.mutationOptions({
      onSuccess: redirect,
      onError,
    })
  );
  const queryClient = useQueryClient();
  const switchToCredits = useMutation(
    trpc.billing.switchToCredits.mutationOptions({
      onSuccess: async ({ applied }) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.billing.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.credits.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.aiKeys.pathKey() }),
        ]);
        if (applied) {
          toast.success(
            t.formatMessage({
              defaultMessage: "You’re on the credit subscription now.",
            })
          );
        } else {
          toast.error(
            t.formatMessage({
              defaultMessage:
                "The payment didn’t go through, so your plan stays as it was. Update your card in Manage payments and try again.",
            })
          );
        }
      },
      onError,
    })
  );

  const currency = t.locale === "pt-BR" ? "brl" : "usd";
  const price = (product: CheckoutProduct) =>
    t.formatNumber(billingCatalog.prices[product][currency] / 100, {
      style: "currency",
      currency: currency.toUpperCase(),
    });
  const subscription = status.data?.subscription;
  const subscribed = !!subscription && isLiveSubscription(subscription.status);
  const live = subscribed ? subscription : null;
  const plan = live?.plan ?? null;
  const annual = subscription?.interval === "year";
  const busy =
    checkout.isPending ||
    portal.isPending ||
    changeInterval.isPending ||
    switchToCredits.isPending;
  const buy = (product: CheckoutProduct) => checkout.mutate({ product });
  const date = (value: Date) => t.formatDate(value, { dateStyle: "medium" });
  const carryoverEndsAt = status.data?.carryoverEndsAt;

  return (
    <div className="w-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 text-sm">
        <section className="bg-card flex flex-col gap-2 rounded-lg border p-4">
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
                      defaultMessage: "Credit subscription",
                    }),
                    own_key: t.formatMessage({
                      defaultMessage: "Own-key subscription",
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
                ? plan === "own_key"
                  ? t.formatMessage({
                      defaultMessage:
                        "Your last payment failed. Update your card to keep your subscription.",
                    })
                  : t.formatMessage({
                      defaultMessage:
                        "Your last payment failed. Update your card to keep receiving monthly credits.",
                    })
                : subscription.cancelAtPeriodEnd
                  ? plan === "own_key"
                    ? t.formatMessage(
                        {
                          defaultMessage:
                            "Cancelled: it ends on {date}, and your key keeps working until then. You can remove your key now.",
                        },
                        { date: date(subscription.currentPeriodEnd) }
                      )
                    : t.formatMessage(
                        {
                          defaultMessage:
                            "Cancelled: it ends on {date}, and you keep this month’s credits until then.",
                        },
                        { date: date(subscription.currentPeriodEnd) }
                      )
                  : subscription.scheduledInterval === "month"
                    ? t.formatMessage(
                        {
                          defaultMessage:
                            "Billed yearly until {date}, then monthly from that day.",
                        },
                        { date: date(subscription.currentPeriodEnd) }
                      )
                    : annual
                      ? t.formatMessage(
                          {
                            defaultMessage: "Billed yearly. Renews on {date}.",
                          },
                          { date: date(subscription.currentPeriodEnd) }
                        )
                      : t.formatMessage(
                          {
                            defaultMessage: "Billed monthly. Renews on {date}.",
                          },
                          { date: date(subscription.currentPeriodEnd) }
                        )}
            </p>
          )}
          {plan === "own_key" && carryoverEndsAt && (
            <p className="text-muted-foreground">
              {t.formatMessage(
                {
                  defaultMessage:
                    "Your previous credit subscription was already paid until {date}: its monthly credits keep coming until then, and they’re spent before your key.",
                },
                { date: date(carryoverEndsAt) }
              )}
            </p>
          )}
          {subscribed &&
            !subscription.cancelAtPeriodEnd &&
            !subscription.scheduledInterval && (
              <Button
                variant="outline"
                className="self-start"
                disabled={busy}
                onClick={() => changeInterval.mutate({})}
              >
                <CalendarSync />
                {annual
                  ? t.formatMessage({
                      defaultMessage: "Switch to monthly billing",
                    })
                  : t.formatMessage({
                      defaultMessage: "Switch to annual billing",
                    })}
              </Button>
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
                defaultMessage: "Manage payments and cancel",
              })}
            </Button>
          )}
          <Button variant="outline" className="self-start" asChild>
            <Link href="/app/billing/usage">
              <ReceiptText />
              {t.formatMessage({ defaultMessage: "Usage statement" })}
            </Link>
          </Button>
        </section>

        <FinishWithCredits />

        {(plan === "own_key" || credits.data?.plan === "courtesy") && (
          <OwnKeySection
            canRemove={
              plan === "own_key" ? !!subscription?.cancelAtPeriodEnd : true
            }
          />
        )}

        {!subscribed && (
          <section className="flex flex-col gap-3">
            <h2 className="font-medium">
              {t.formatMessage({ defaultMessage: "Credit subscription" })}
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

        {!subscribed && (
          <OwnKeyOffer
            title={t.formatMessage({ defaultMessage: "Own-key subscription" })}
            description={t.formatMessage(
              {
                defaultMessage:
                  "Your own Anthropic key pays for the AI, and the subscription pays for the platform. It keeps the {credits, number} monthly credits for fit checks, for when your key can’t pay.",
              },
              { credits: creditSettings.monthlyFreeCredits }
            )}
            price={price}
          />
        )}

        {live?.plan === "credits" && !live.cancelAtPeriodEnd && (
          <OwnKeyOffer
            title={t.formatMessage({
              defaultMessage: "Switch to the own-key subscription",
            })}
            description={
              annual
                ? t.formatMessage(
                    {
                      defaultMessage:
                        "Your own Anthropic key pays for the AI from now on. Nothing is refunded and nothing is lost: your year was paid until {date}, so this month’s credits stay and each month left still brings {credits, number} credits until then, spent before your key.",
                    },
                    {
                      date: date(live.currentPeriodEnd),
                      credits: creditSettings.subscriptionMonthlyCredits,
                    }
                  )
                : t.formatMessage(
                    {
                      defaultMessage:
                        "Your own Anthropic key pays for the AI from now on. Nothing is refunded and nothing is lost: this month’s credits stay until {date}, spent before your key.",
                    },
                    { date: date(live.currentPeriodEnd) }
                  )
            }
            price={price}
          />
        )}

        {live?.plan === "own_key" && !live.cancelAtPeriodEnd && (
          <section className="flex flex-col gap-3">
            <h2 className="font-medium">
              {t.formatMessage({
                defaultMessage: "Switch to the credit subscription",
              })}
            </h2>
            <p className="text-muted-foreground">
              {t.formatMessage(
                {
                  defaultMessage:
                    "{credits, number} credits every month instead of your key, for {price}. It starts today: what’s left of your current period is discounted on the first invoice, and your key is deleted.",
                },
                {
                  credits: creditSettings.subscriptionMonthlyCredits,
                  price: annual
                    ? t.formatMessage(
                        { defaultMessage: "{price} a year" },
                        { price: price("subscription_annual") }
                      )
                    : t.formatMessage(
                        { defaultMessage: "{price} a month" },
                        { price: price("subscription_monthly") }
                      ),
                }
              )}
            </p>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="self-start" disabled={busy}>
                  {t.formatMessage({ defaultMessage: "Switch to credits" })}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {t.formatMessage({
                      defaultMessage: "Switch to the credit subscription?",
                    })}
                  </DialogTitle>
                  <DialogDescription>
                    {t.formatMessage({
                      defaultMessage:
                        "Your card is charged now, minus what’s left of your current period. Your key is deleted, and the month’s credits arrive once the payment goes through.",
                    })}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">
                      {t.formatMessage({ defaultMessage: "Keep my key" })}
                    </Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button
                      disabled={busy}
                      onClick={() => switchToCredits.mutate({})}
                    >
                      {t.formatMessage({ defaultMessage: "Switch and pay" })}
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
    <div className="bg-card flex items-center justify-between gap-3 rounded-lg border p-4">
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
