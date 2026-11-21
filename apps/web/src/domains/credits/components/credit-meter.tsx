"use client";

import { ArrowRight, Coins, Package, ReceiptText } from "lucide-react";
import Link from "next/link";

import {
  type CreditSummary,
  planSources,
} from "@repo/api/domains/credits/schemas/credits";
import { useTranslation } from "@repo/intl/use-translation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/web/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@repo/web/components/ui/sidebar";

import { useCredits } from "../hooks/use-credits";
import { useUsageStatement } from "../hooks/use-usage-statement";

/**
 * The credit meter (billing spec, "Credit meter"): what the user can still
 * spend, in actions; one tap shows it by source and expiry.
 */
export function CreditMeter() {
  const t = useTranslation();
  const { data } = useCredits();
  if (!data) return null;

  // Fit-check-only credits buy no resume nor letter.
  const general = data.lots
    .filter((lot) => lot.scope === "any")
    .reduce((total, lot) => total + lot.remaining, 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          tooltip={t.formatMessage(
            { defaultMessage: "{credits, number} credits" },
            { credits: data.available }
          )}
        >
          <Coins className="text-brand-accent" />
          <span className="flex items-baseline gap-1.5">
            <span className="font-mono font-medium tabular-nums">
              {t.formatNumber(data.available)}
            </span>
            {t.formatMessage(
              {
                defaultMessage:
                  "{credits, plural, one {credit} other {credits}}",
              },
              { credits: data.available }
            )}
          </span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-80">
        <DropdownMenuLabel className="flex flex-col gap-1.5 px-2 py-2 font-normal">
          <span className="flex items-baseline gap-2">
            <span className="font-display text-3xl leading-none font-semibold tabular-nums">
              {t.formatNumber(data.available)}
            </span>
            {t.formatMessage(
              {
                defaultMessage:
                  "{credits, plural, one {credit available} other {credits available}}",
              },
              { credits: data.available }
            )}
          </span>
          <span className="text-muted-foreground text-xs">
            {t.formatMessage(
              {
                defaultMessage:
                  "Enough for about {resumes, plural, one {# resume} other {# resumes}} or {letters, plural, one {# cover letter} other {# cover letters}}.",
              },
              {
                resumes: Math.floor(
                  general / Math.max(1, data.estimates.resume)
                ),
                letters: Math.floor(
                  general / Math.max(1, data.estimates.coverLetter)
                ),
              }
            )}
          </span>
          <SpendBar available={data.available} />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex flex-col gap-1 px-2 py-1.5 text-xs">
          {data.lots.map((lot, index) => (
            <span key={index} className="flex items-center gap-2">
              <Package className="text-muted-foreground size-3.5 shrink-0" />
              <LotLine lot={lot} />
            </span>
          ))}
          {data.reserved > 0 && (
            <span className="text-muted-foreground">
              {t.formatMessage(
                {
                  defaultMessage:
                    "{credits, number} held by running tasks until they finish",
                },
                { credits: data.reserved }
              )}
            </span>
          )}
          {data.reserve > 0 && (
            <span className={data.nearReserve ? "text-warning" : undefined}>
              {t.formatMessage(
                {
                  defaultMessage:
                    "{credits, number} kept for your resume: the interview won’t use them.",
                },
                { credits: data.reserve }
              )}
            </span>
          )}
          {data.key && (
            <span
              className={
                data.key.status === "active" ? undefined : "text-warning"
              }
            >
              {data.key.status !== "active"
                ? t.formatMessage({
                    defaultMessage:
                      "Your own key stopped working: see Plan and credits.",
                  })
                : data.key.paysNext
                  ? t.formatMessage(
                      {
                        defaultMessage:
                          "Your own key pays for AI now: about {amount} this month (an estimate). Credits stay as a reserve.",
                      },
                      {
                        amount: t.formatNumber(data.key.spentThisMonthUsd, {
                          style: "currency",
                          currency: "USD",
                        }),
                      }
                    )
                  : t.formatMessage(
                      {
                        defaultMessage:
                          "Your own key takes over when this month’s plan credits run out (about {amount} spent on it this month).",
                      },
                      {
                        amount: t.formatNumber(data.key.spentThisMonthUsd, {
                          style: "currency",
                          currency: "USD",
                        }),
                      }
                    )}
            </span>
          )}
          {data.courtesy && (
            <span className="text-muted-foreground">
              {data.courtesy.endsAt
                ? t.formatMessage(
                    {
                      defaultMessage:
                        "Courtesy plan: {credits, number} credits a month, until {date}",
                    },
                    {
                      credits: data.courtesy.monthlyCredits,
                      date: t.formatDate(data.courtesy.endsAt, {
                        dateStyle: "medium",
                      }),
                    }
                  )
                : t.formatMessage(
                    {
                      defaultMessage:
                        "Courtesy plan: {credits, number} credits a month",
                    },
                    { credits: data.courtesy.monthlyCredits }
                  )}
            </span>
          )}
        </div>
        <DropdownMenuSeparator />
        <UsageLine />
        {data.storedLocked > 0 && (
          <DropdownMenuItem asChild>
            <Link href="/app/billing#finish-with-credits">
              {t.formatMessage(
                {
                  defaultMessage:
                    "Finish with credits: {credits, number} stored credits wait for your OK",
                },
                { credits: data.storedLocked }
              )}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/app/billing" className="font-medium">
            <Coins className="text-brand-accent" />
            {data.plan === "free"
              ? t.formatMessage({
                  defaultMessage: "Subscribe or buy credits",
                })
              : t.formatMessage({ defaultMessage: "Plan and credits" })}
            <ArrowRight className="ml-auto" />
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * What the user spent in the plan's current credit month (the last 30
 * days on Free), debited and as a credit equivalent, with a link to the
 * usage statement.
 */
function UsageLine() {
  const t = useTranslation();
  const { data } = useUsageStatement();
  if (!data) return null;
  const credits = data.totals.reduce((total, row) => total + row.credits, 0);
  const tokens = data.totals.reduce(
    (total, row) => total + row.inputTokens + row.outputTokens,
    0
  );
  return (
    <DropdownMenuItem asChild>
      <Link href="/app/billing/usage" className="items-start">
        <ReceiptText className="mt-0.5" />
        <span className="flex flex-col">
          <span className="font-medium">
            {t.formatMessage({ defaultMessage: "Usage statement" })}
          </span>
          <span className="text-muted-foreground text-xs">
            {t.formatMessage(
              {
                defaultMessage:
                  "{credits} credits and {tokens} tokens since {date}",
              },
              {
                credits: t.formatNumber(credits, { maximumFractionDigits: 1 }),
                tokens: t.formatNumber(tokens),
                date: t.formatDate(data.window.from, { dateStyle: "medium" }),
              }
            )}
          </span>
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

/**
 * What is left against what this credit month used (the usage statement's
 * own window): the brand's orange marks what is still the user's.
 */
function SpendBar({ available }: { available: number }) {
  const t = useTranslation();
  const { data } = useUsageStatement();
  if (!data) return null;
  const used = Math.round(
    data.totals.reduce((total, row) => total + row.credits, 0)
  );
  const share = available + used > 0 ? available / (available + used) : 1;
  return (
    <span className="flex flex-col gap-1 pt-1">
      <span className="bg-muted flex h-1.5 overflow-hidden rounded-full">
        <span
          className="bg-brand-accent h-full rounded-full"
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </span>
      <span className="text-muted-foreground flex justify-between font-mono text-[11px] tabular-nums">
        <span>
          {t.formatMessage(
            { defaultMessage: "{credits, number} left" },
            { credits: available }
          )}
        </span>
        <span>
          {t.formatMessage(
            { defaultMessage: "{credits, number} used" },
            { credits: used }
          )}
        </span>
      </span>
    </span>
  );
}

function LotLine({ lot }: { lot: CreditSummary["lots"][number] }) {
  const t = useTranslation();
  const source = {
    welcome: t.formatMessage({ defaultMessage: "welcome credits" }),
    monthly_free: t.formatMessage({
      defaultMessage: "this month’s, for fit checks",
    }),
    courtesy: t.formatMessage({ defaultMessage: "from the courtesy plan" }),
    subscription: t.formatMessage({ defaultMessage: "from the plan" }),
    pack: t.formatMessage({ defaultMessage: "from a pack" }),
  }[lot.source];
  if (!lot.expiresAt) {
    return (
      <span>
        {t.formatMessage(
          { defaultMessage: "{credits, number} {source}, never expire" },
          { credits: lot.remaining, source }
        )}
      </span>
    );
  }
  // Expiry is the instant the next period starts: show its eve.
  const date = t.formatDate(new Date(lot.expiresAt.getTime() - 1), {
    dateStyle: "medium",
  });
  return (
    <span>
      {planSources.includes(lot.source)
        ? t.formatMessage(
            { defaultMessage: "{credits, number} {source}, expire on {date}" },
            { credits: lot.remaining, source, date }
          )
        : t.formatMessage(
            {
              defaultMessage: "{credits, number} {source}, valid until {date}",
            },
            { credits: lot.remaining, source, date }
          )}
    </span>
  );
}
