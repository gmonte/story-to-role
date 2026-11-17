"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  type MetricsPeriod,
  type TrackerMetrics,
  metricsPeriodSchema,
} from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { useTRPC } from "~/tools/trpc/client";

import { useTrackerLabels } from "../hooks/use-tracker-labels";

// Below this many sent applications a rate says little (the method asks
// to warn when there is too little data to conclude anything).
const fewApplications = 5;

/**
 * The method's simple metrics over a period the user picks (tracker spec,
 * "Metrics"): response rates per resume version and per source, the median
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
    <section className="flex flex-col gap-3 rounded-lg border p-4">
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
  const rate = (group: { sent: number; responded: number }) =>
    t.formatMessage(
      { defaultMessage: "{responded, number} of {sent, number} ({rate})" },
      {
        responded: group.responded,
        sent: group.sent,
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
        {stat(t.formatMessage({ defaultMessage: "Responses" }), rate(metrics))}
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
          t.formatMessage(
            {
              defaultMessage:
                "{total, plural, =0 {None applied} other {{interviews, number} of {total, number}}}",
            },
            {
              total: metrics.highFit.total,
              interviews: metrics.highFit.interviews,
            }
          )
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-medium">
            {t.formatMessage({
              defaultMessage: "Response rate per resume version",
            })}
          </h3>
          <ul className="flex flex-col gap-1">
            {metrics.byResume.map((group) => (
              <li
                key={group.versionId ?? "none"}
                className="flex justify-between gap-2"
              >
                <span className="truncate">
                  {group.versionId
                    ? (group.label ??
                      t.formatMessage({ defaultMessage: "Resume" }))
                    : t.formatMessage({ defaultMessage: "Not recorded" })}
                </span>
                <span className="text-muted-foreground">{rate(group)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-medium">
            {t.formatMessage({ defaultMessage: "Response rate per source" })}
          </h3>
          <ul className="flex flex-col gap-1">
            {metrics.bySource.map((group) => (
              <li
                key={group.source ?? "none"}
                className="flex justify-between gap-2"
              >
                <span>{labels.source(group.source)}</span>
                <span className="text-muted-foreground">{rate(group)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
