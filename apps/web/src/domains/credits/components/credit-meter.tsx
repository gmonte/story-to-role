"use client";

import { Coins } from "lucide-react";
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
          <Coins />
          <span>
            {t.formatMessage(
              { defaultMessage: "{credits, number} credits" },
              { credits: data.available }
            )}
          </span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-80">
        <DropdownMenuLabel className="font-normal">
          {t.formatMessage(
            {
              defaultMessage:
                "You can still spend {credits, number} credits (about {resumes, plural, one {# resume} other {# resumes}} or {letters, plural, one {# cover letter} other {# cover letters}}).",
            },
            {
              credits: data.available,
              resumes: Math.floor(general / Math.max(1, data.estimates.resume)),
              letters: Math.floor(
                general / Math.max(1, data.estimates.coverLetter)
              ),
            }
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex flex-col gap-1 px-2 py-1.5 text-xs">
          {data.lots.map((lot, index) => (
            <LotLine key={index} lot={lot} />
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
            <span className={data.nearReserve ? "text-amber-600" : undefined}>
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
                data.key.status === "active" ? undefined : "text-amber-600"
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
          <Link href="/app/billing">
            {data.plan === "free"
              ? t.formatMessage({
                  defaultMessage: "Subscribe or buy credits",
                })
              : t.formatMessage({ defaultMessage: "Plan and credits" })}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
