"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { reviewLoopSettings } from "@repo/api/domains/documents/generation/review-loop-settings";
import {
  type MetricsPeriod,
  type TrackerMetrics,
  metricsPeriodSchema,
} from "@repo/api/domains/applications/schemas/tracker";
import type { FitBand } from "@repo/api/domains/openings/schemas/opening";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Skeleton } from "@repo/web/components/ui/skeleton";
import { cn } from "@repo/web/lib/utils";

import { useTRPC } from "~/tools/trpc/client";
import { useOpeningLabels } from "~/domains/openings/hooks/use-opening-labels";
import { FitBandDot } from "~/domains/openings/components/fit-band-badge";
import { bandTextClassName } from "~/domains/openings/components/fit-check-panel";

import { useTrackerLabels } from "../hooks/use-tracker-labels";

// Below this many sent applications a rate says little (the method asks
// to warn when there is too little data to conclude anything).
const fewApplications = 5;

/**
 * The method's simple metrics over a period the user picks (tracker spec,
 * "Metrics"): response rates by resume origin, score and fit, and per source, the median
 * time to the first response and the high-fit openings that reached an
 * interview. A response is the company answering: In process, Offer, Hired
 * or Rejected.
 */
export function TrackerMetricsPanel() {
  const t = useTranslation();
  const trpc = useTRPC();
  const [period, setPeriod] = useState<MetricsPeriod>("90d");
  const metrics = useQuery(trpc.tracker.metrics.queryOptions({ period }));
  const periods: Record<MetricsPeriod, string> = {
    "30d": t.formatMessage({ defaultMessage: "Last 30 days" }),
    "90d": t.formatMessage({ defaultMessage: "Last 90 days" }),
    all: t.formatMessage({ defaultMessage: "All time" }),
  };

  return (
    <section className="bg-card flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">
          {t.formatMessage({ defaultMessage: "Metrics" })}
        </h2>
        <div className="flex gap-1">
          {metricsPeriodSchema.options.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={option === period ? "secondary" : "ghost"}
              aria-pressed={option === period}
              onClick={() => setPeriod(option)}
            >
              {periods[option]}
            </Button>
          ))}
        </div>
      </div>
      {/* The figures' room, held while they load. */}
      {metrics.isPending && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      )}
      {metrics.data &&
        (metrics.data.sent === 0 ? (
          <p className="text-muted-foreground">
            {t.formatMessage({
              defaultMessage: "No applications sent in this period.",
            })}
          </p>
        ) : (
          <MetricsBody metrics={metrics.data} />
        ))}
    </section>
  );
}

function MetricsBody({ metrics }: { metrics: TrackerMetrics }) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const openingLabels = useOpeningLabels();
  const rate = (group: { sent: number; responded: number }) =>
    t.formatMessage(
      {
        defaultMessage: "{sent} · {responded} ({rate})",
      },
      {
        responded: t.formatMessage(
          {
            defaultMessage:
              "{responded, plural, =0 {no replies} one {# reply} other {# replies}}",
          },
          { responded: group.responded }
        ),
        sent: t.formatMessage(
          {
            defaultMessage:
              "{sent, plural, =0 {none sent} one {# sent} other {# sent}}",
          },
          { sent: group.sent }
        ),
        rate: t.formatNumber(group.responded / group.sent, {
          style: "percent",
        }),
      }
    );
  const stat = (label: string, value: string) => (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {metrics.sent < fewApplications && (
        <p className="text-muted-foreground text-xs">
          {t.formatMessage({
            defaultMessage:
              "Few applications in this period: too little data to conclude anything.",
          })}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        {stat(
          t.formatMessage({ defaultMessage: "Sent" }),
          t.formatNumber(metrics.sent)
        )}
        {stat(
          t.formatMessage({ defaultMessage: "Responses" }),
          t.formatMessage(
            { defaultMessage: "{responded, number} ({rate})" },
            {
              responded: metrics.responded,
              rate: t.formatNumber(metrics.responded / metrics.sent, {
                style: "percent",
              }),
            }
          )
        )}
        {stat(
          t.formatMessage({ defaultMessage: "Median time to first response" }),
          metrics.medianDaysToResponse === null
            ? t.formatMessage({ defaultMessage: "No data" })
            : t.formatMessage(
                {
                  defaultMessage:
                    "{days, plural, =0 {Same day} one {# day} other {# days}}",
                },
                { days: metrics.medianDaysToResponse }
              )
        )}
        {stat(
          t.formatMessage({
            defaultMessage: "High-fit openings that reached an interview",
          }),
          metrics.highFit.total === 0
            ? t.formatMessage({ defaultMessage: "None applied" })
            : t.formatMessage(
                { defaultMessage: "{interviews, number} of {total, number}" },
                {
                  total: metrics.highFit.total,
                  interviews: metrics.highFit.interviews,
                }
              )
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RateGroup
          title={t.formatMessage({
            defaultMessage: "Response rate by resume origin",
          })}
          rows={metrics.byOrigin.map((group) => ({
            key: `${group.origin}-${group.libraryDocumentId ?? ""}`,
            label:
              group.origin === "generated"
                ? t.formatMessage({
                    defaultMessage: "Generated for the opening",
                  })
                : group.origin === "library"
                  ? t.formatMessage(
                      { defaultMessage: "From a library resume: {name}" },
                      {
                        name:
                          group.label ??
                          t.formatMessage({ defaultMessage: "Resume" }),
                      }
                    )
                  : t.formatMessage({ defaultMessage: "Not recorded" }),
            group,
          }))}
          rate={rate}
        />
        <RateGroup
          title={t.formatMessage({
            defaultMessage: "Response rate by resume score",
          })}
          rows={metrics.byScore.map((group) => ({
            key: group.band,
            label:
              group.band === "reached"
                ? t.formatMessage(
                    { defaultMessage: "Score {target} or more" },
                    { target: reviewLoopSettings.targetRating }
                  )
                : group.band === "below"
                  ? t.formatMessage(
                      { defaultMessage: "Below {target}" },
                      { target: reviewLoopSettings.targetRating }
                    )
                  : t.formatMessage({ defaultMessage: "No score" }),
            group,
          }))}
          rate={rate}
        />
        <RateGroup
          title={t.formatMessage({
            defaultMessage: "Response rate by fit",
          })}
          rows={metrics.byFit.map((group) => ({
            key: group.band ?? "none",
            band: group.band,
            label: group.band
              ? openingLabels.band(group.band)
              : t.formatMessage({ defaultMessage: "Not checked" }),
            group,
          }))}
          rate={rate}
        />
        <RateGroup
          title={t.formatMessage({
            defaultMessage: "Response rate per source",
          })}
          rows={metrics.bySource.map((group) => ({
            key: group.source ?? "none",
            label: labels.source(group.source),
            group,
          }))}
          rate={rate}
        />
      </div>
    </div>
  );
}

/** One compact list of response rates; hidden when it has no rows. */
function RateGroup({
  title,
  rows,
  rate,
}: {
  title: string;
  rows: Array<{
    key: string;
    label: string;
    // A fit band's row shows the band's color.
    band?: FitBand | null;
    group: { sent: number; responded: number };
  }>;
  rate: (group: { sent: number; responded: number }) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h3 className="text-xs font-medium">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li key={row.key} className="flex min-w-0 flex-col">
            <span
              className={cn(
                "flex min-w-0 items-center gap-1.5",
                row.band && bandTextClassName(row.band)
              )}
            >
              {row.band && <FitBandDot band={row.band} />}
              <span className="truncate">{row.label}</span>
            </span>
            <span className="text-muted-foreground text-xs break-words">
              {rate(row.group)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
