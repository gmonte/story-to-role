import { Check, KeyRound } from "lucide-react";
import Link from "next/link";

import { billingCatalog } from "@repo/api/domains/billing/billing-catalog";
import type { CheckoutProduct } from "@repo/api/domains/billing/schemas/billing";
import { creditSettings } from "@repo/api/domains/credits/credit-pricing";
import { getTranslation } from "@repo/intl/get-translation";
import type { Locale } from "@repo/intl/intl-config";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/web/components/ui/card";
import { cn } from "@repo/web/lib/utils";

import { LandingContainer, SectionHeading } from "./section-heading";

/**
 * The offer (billing spec): Free, the credit and own-key subscriptions and
 * credit packs, priced
 * from the same catalog as Stripe, in reais for the Brazilian interface and
 * in dollars otherwise, as the billing page shows them.
 */
export async function LandingPricing({ locale }: { locale: Locale }) {
  const t = await getTranslation(locale);
  const currency = locale === "pt-BR" ? "brl" : "usd";
  const price = (product: CheckoutProduct) =>
    t.formatNumber(billingCatalog.prices[product][currency] / 100, {
      style: "currency",
      currency: currency.toUpperCase(),
    });
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
      price: price("subscription_monthly"),
      period: t.formatMessage({ defaultMessage: "a month" }),
      description: t.formatMessage(
        {
          defaultMessage: "For an active search. Or {price} a year.",
        },
        { price: price("subscription_annual") }
      ),
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
      price: price("own_key_monthly"),
      period: t.formatMessage({ defaultMessage: "a month" }),
      description: t.formatMessage(
        {
          defaultMessage:
            "Your own Anthropic key pays for the AI. Or {price} a year.",
        },
        { price: price("own_key_annual") }
      ),
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={cn(
                "relative",
                plan.featured && "border-primary shadow-lg xl:-my-2 xl:py-8"
              )}
            >
              <CardHeader className="gap-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{plan.name}</CardTitle>
                  {plan.featured && (
                    <Badge>
                      {t.formatMessage({ defaultMessage: "Recommended" })}
                    </Badge>
                  )}
                </div>
                <p className="flex items-baseline gap-1.5">
                  <span className="font-display text-4xl font-semibold tracking-tight">
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="text-muted-foreground text-sm">
                      {plan.period}
                    </span>
                  )}
                </p>
                <CardDescription className="text-pretty">
                  {plan.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="flex flex-col gap-2 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check className="text-brand-accent mt-0.5 size-4 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  asChild
                  className="w-full"
                  variant={plan.featured ? "default" : "outline"}
                >
                  <Link href="/sign-up">{plan.action}</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
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
