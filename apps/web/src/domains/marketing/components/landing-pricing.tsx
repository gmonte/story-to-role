import { Check, KeyRound } from "lucide-react";
import Link from "next/link";

import { billingCatalog } from "@repo/api/domains/billing/billing-catalog";
import type { CheckoutProduct } from "@repo/api/domains/billing/schemas/billing";
import { creditSettings } from "@repo/api/domains/credits/credit-pricing";
import { getTranslation } from "@repo/intl/get-translation";
import type { Locale } from "@repo/intl/intl-config";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { Card, CardDescription, CardTitle } from "@repo/web/components/ui/card";
import { cn } from "@repo/web/lib/utils";

import { CurrencySwitcher } from "~/domains/billing/components/currency-switcher";
import { getCurrencyFromNextCookies } from "~/domains/billing/utils/get-currency-from-next-cookies";

import { LandingContainer, SectionHeading } from "./section-heading";

/**
 * The offer (billing spec): Free, the credit and own-key subscriptions and
 * credit packs, priced from the same catalog as Stripe in the currency the
 * visitor chose, as the billing page shows them. A subscription leads with
 * the annual plan's price a month, the monthly plan's right below it.
 */
export async function LandingPricing({ locale }: { locale: Locale }) {
  const t = await getTranslation(locale);
  const currency = await getCurrencyFromNextCookies(locale);
  const money = (cents: number) =>
    t.formatNumber(cents / 100, {
      style: "currency",
      currency: currency.toUpperCase(),
    });
  const price = (product: CheckoutProduct) =>
    money(billingCatalog.prices[product][currency]);
  const annualMonth = (product: CheckoutProduct) =>
    money(billingCatalog.prices[product][currency] / 12);
  const number = (value: number) => t.formatNumber(value);

  const plans = [
    {
      name: t.formatMessage({ defaultMessage: "Free" }),
      price: t.formatNumber(0, {
        style: "currency",
        currency: currency.toUpperCase(),
        maximumFractionDigits: 0,
      }),
      period: "",
      description: t.formatMessage(
        {
          defaultMessage:
            "{credits} welcome credits, enough to write your profile and get your resume in Portuguese and English plus a cover letter.",
        },
        { credits: number(creditSettings.welcomeCredits) }
      ),
      features: [
        t.formatMessage(
          { defaultMessage: "{credits} welcome credits that never expire" },
          { credits: number(creditSettings.welcomeCredits) }
        ),
        t.formatMessage(
          { defaultMessage: "{credits} credits a month for fit checks" },
          { credits: number(creditSettings.monthlyFreeCredits) }
        ),
        t.formatMessage({ defaultMessage: "Every generation option" }),
        t.formatMessage({ defaultMessage: "No card required" }),
      ],
      action: t.formatMessage({ defaultMessage: "Start free" }),
      featured: false,
    },
    {
      name: t.formatMessage({ defaultMessage: "Credit subscription" }),
      price: annualMonth("subscription_annual"),
      period: t.formatMessage({ defaultMessage: "a month" }),
      billed: price("subscription_annual"),
      monthly: price("subscription_monthly"),
      description: t.formatMessage({ defaultMessage: "For an active search." }),
      features: [
        t.formatMessage(
          { defaultMessage: "{credits} credits every month" },
          { credits: number(creditSettings.subscriptionMonthlyCredits) }
        ),
        t.formatMessage({
          defaultMessage: "The full career interview, fit checks and documents",
        }),
        t.formatMessage({ defaultMessage: "Cancel anytime" }),
      ],
      action: t.formatMessage({ defaultMessage: "Subscribe" }),
      featured: true,
    },
    {
      name: t.formatMessage({ defaultMessage: "Own-key subscription" }),
      price: annualMonth("own_key_annual"),
      period: t.formatMessage({ defaultMessage: "a month" }),
      billed: price("own_key_annual"),
      monthly: price("own_key_monthly"),
      description: t.formatMessage({
        defaultMessage: "Your own Anthropic key pays for the AI.",
      }),
      features: [
        t.formatMessage({
          defaultMessage: "Every AI call paid by your key, not credits",
        }),
        t.formatMessage({
          defaultMessage:
            "A Claude Max or Team key uses that plan’s monthly API credits",
        }),
        t.formatMessage(
          { defaultMessage: "{credits} credits a month for fit checks" },
          { credits: number(creditSettings.monthlyFreeCredits) }
        ),
        t.formatMessage({ defaultMessage: "Cancel anytime" }),
      ],
      action: t.formatMessage({ defaultMessage: "Subscribe" }),
      featured: false,
    },
    {
      name: t.formatMessage({ defaultMessage: "Credit pack" }),
      price: price("pack"),
      period: t.formatMessage({ defaultMessage: "once" }),
      description: t.formatMessage({
        defaultMessage: "Pay only when you use it, with no subscription.",
      }),
      features: [
        t.formatMessage(
          { defaultMessage: "{credits} credits" },
          { credits: number(creditSettings.packCredits) }
        ),
        t.formatMessage(
          { defaultMessage: "Valid for {months} months" },
          { months: number(creditSettings.packValidityMonths) }
        ),
        t.formatMessage({ defaultMessage: "Spend them on anything" }),
      ],
      action: t.formatMessage({ defaultMessage: "Buy credits" }),
      featured: false,
    },
  ];

  return (
    <section id="pricing" className="scroll-mt-14 py-16 md:py-24">
      <LandingContainer className="flex flex-col gap-12">
        <SectionHeading
          eyebrow={t.formatMessage({ defaultMessage: "Pricing" })}
          title={t.formatMessage({
            defaultMessage: "Pay for what you use, never per document",
          })}
          lead={t.formatMessage({
            defaultMessage:
              "Every AI action spends credits, and each shows its estimate before you confirm.",
          })}
        />
        <div className="-mt-6 flex justify-center">
          <CurrencySwitcher currency={currency} />
        </div>
        {/* One row per part shared by every card (subgrid), so each card's
            title, price and details line up with the others' even where a
            card leaves a part empty. */}
        <div className="grid gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const annual = plan.billed && plan.monthly;
            return (
              <Card
                key={plan.name}
                className={cn(
                  "relative row-span-8 grid grid-rows-subgrid gap-0 px-6",
                  plan.featured && "border-primary shadow-lg xl:-my-2 xl:py-8"
                )}
              >
                <div className="flex items-start justify-between gap-2 pb-3">
                  <CardTitle className="leading-snug">{plan.name}</CardTitle>
                  {plan.featured && (
                    <Badge>
                      {t.formatMessage({ defaultMessage: "Recommended" })}
                    </Badge>
                  )}
                </div>
                <div>
                  {annual && (
                    <span className="text-brand-accent-text block pb-1 text-xs font-semibold tracking-wide uppercase">
                      {t.formatMessage({ defaultMessage: "Annual plan" })}
                    </span>
                  )}
                </div>
                <p className="flex items-baseline gap-1.5 self-end">
                  <span className="font-display text-4xl font-semibold tracking-tight">
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="text-muted-foreground text-sm whitespace-nowrap">
                      {plan.period}
                    </span>
                  )}
                </p>
                {annual ? (
                  <>
                    <div>
                      {annual && (
                        <div className="flex flex-col gap-1 pt-3">
                          <span className="text-sm font-medium">
                            {t.formatMessage(
                              { defaultMessage: "Billed {price} a year" },
                              { price: plan.billed }
                            )}
                          </span>
                          <span className="bg-brand-accent-soft text-brand-accent-text w-fit rounded-sm px-2 py-0.5 text-xs font-semibold">
                            {t.formatMessage({
                              defaultMessage: "2 months free",
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      {/* The monthly plan, in plain sight beside the annual. */}
                      {annual && (
                        <div className="mt-3 flex items-baseline justify-between gap-2 border-t pt-3 text-sm">
                          <span className="text-muted-foreground">
                            {t.formatMessage({
                              defaultMessage: "Monthly plan",
                            })}
                          </span>
                          <span className="font-medium whitespace-nowrap">
                            {t.formatMessage(
                              { defaultMessage: "{price} a month" },
                              { price: plan.monthly }
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    <CardDescription className="pt-3 text-pretty">
                      {plan.description}
                    </CardDescription>
                  </>
                ) : (
                  // No annual plan: the description fills the rows the
                  // subscriptions give to their totals.
                  <CardDescription className="row-span-3 pt-3 text-pretty">
                    {plan.description}
                  </CardDescription>
                )}
                <ul className="flex flex-col gap-2 pt-6 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check className="text-brand-accent mt-0.5 size-4 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="flex items-end pt-6">
                  <Button
                    asChild
                    className="w-full"
                    variant={plan.featured ? "default" : "outline"}
                  >
                    <Link href="/sign-up">{plan.action}</Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
        <p className="text-muted-foreground flex items-center justify-center gap-2 text-center text-sm text-pretty">
          <KeyRound className="size-4 shrink-0" />
          {t.formatMessage({
            defaultMessage:
              "Have a Claude Max or Team plan? With the own-key subscription, your Anthropic key pays for the AI instead of credits.",
          })}
        </p>
      </LandingContainer>
    </section>
  );
}
