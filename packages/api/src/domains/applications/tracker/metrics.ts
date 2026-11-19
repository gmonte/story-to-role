import { reviewLoopSettings } from "@repo/api/domains/documents/generation/review-loop-settings";

import type {
  ApplicationSource,
  ApplicationStatus,
} from "../schemas/application";
import type {
  MetricsPeriod,
  ResumeVersionRef,
  TrackerMetrics,
} from "../schemas/tracker";

const day = 24 * 3600 * 1000;

/**
 * How "response" and "interview" read from the statuses that exist
 * (docs/plan.md, P9 notes). The company responded when the application
 * reached "In process", "Offer", "Hired" or "Rejected" at any time: a
 * rejection is an answer too. "Withdrawn" (the user gave up) and "No
 * response" (silence) are not responses. An interview is reached when the
 * application got to "In process" or beyond ("Offer", "Hired"): "In
 * process" covers screening, interview or test, so it is the closest
 * structured signal; a rejection alone is not an interview.
 */
export const responseStatuses: ApplicationStatus[] = [
  "in_process",
  "offer",
  "hired",
  "rejected",
];
export const interviewStatuses: ApplicationStatus[] = [
  "in_process",
  "offer",
  "hired",
];

export type MetricsRow = {
  appliedAt: Date;
  source: ApplicationSource | null;
  status: ApplicationStatus;
  // The status changes on the timeline (`fromStatus` is null for the entry
  // an external application starts with, whose date says nothing of when
  // the company answered).
  changes: Array<{
    fromStatus: ApplicationStatus | null;
    toStatus: ApplicationStatus | null;
    occurredAt: Date;
  }>;
  // Every resume version the application was sent with.
  resumes: ResumeVersionRef[];
  // Where the resume sent came from and its review rating (the last
  // version sent); null when no resume is recorded.
  sentResume: {
    library: { documentId: string; label: string | null } | null;
    // The resume was written for the opening, not taken from the library.
    generated: boolean;
    rating: number | null;
  } | null;
  // The band of the opening's latest fit check, if it has one.
  fitBand: "high" | "medium" | "low" | null;
};

const periodDays: Record<Exclude<MetricsPeriod, "all">, number> = {
  "30d": 30,
  "90d": 90,
};

export function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The method's metrics over the applications sent in a period, from
 * structured fields only: nothing here reads free text or calls an AI.
 */
export function computeMetrics(input: {
  rows: MetricsRow[];
  period: MetricsPeriod;
  now: Date;
}): TrackerMetrics {
  const since =
    input.period === "all"
      ? null
      : input.now.getTime() - periodDays[input.period] * day;
  const rows = input.rows.filter(
    (row) => since === null || row.appliedAt.getTime() >= since
  );

  const reached = (row: MetricsRow, statuses: ApplicationStatus[]) =>
    statuses.includes(row.status) ||
    row.changes.some((c) => c.toStatus && statuses.includes(c.toStatus));
  const responded = (row: MetricsRow) => reached(row, responseStatuses);
  const interviewed = (row: MetricsRow) => reached(row, interviewStatuses);

  const group = <K>(key: (row: MetricsRow) => K[]) => {
    const groups = new Map<
      string,
      { key: K; sent: number; responded: number }
    >();
    for (const row of rows) {
      for (const k of key(row)) {
        const id = JSON.stringify(k);
        const entry = groups.get(id) ?? { key: k, sent: 0, responded: 0 };
        entry.sent += 1;
        if (responded(row)) entry.responded += 1;
        groups.set(id, entry);
      }
    }
    return [...groups.values()].sort((a, b) => b.sent - a.sent);
  };

  const days = rows.flatMap((row) => {
    const first = row.changes
      .filter(
        (c) =>
          c.fromStatus !== null &&
          c.toStatus &&
          responseStatuses.includes(c.toStatus) &&
          c.occurredAt >= row.appliedAt
      )
      .map((c) => c.occurredAt.getTime())
      .sort((a, b) => a - b)[0];
    return first === undefined ? [] : [(first - row.appliedAt.getTime()) / day];
  });
  const medianDays = median(days);

  const highFit = rows.filter((row) => row.fitBand === "high");
  return {
    period: input.period,
    sent: rows.length,
    responded: rows.filter(responded).length,
    interviews: rows.filter(interviewed).length,
    byOrigin: group<{
      origin: "generated" | "library" | "unknown";
      id: string | null;
    }>((row) => {
      const sent = row.sentResume;
      if (!sent) return [{ origin: "unknown", id: null }];
      if (sent.library) {
        return [{ origin: "library", id: sent.library.documentId }];
      }
      return [{ origin: sent.generated ? "generated" : "unknown", id: null }];
    }).map(({ key, sent, responded }) => ({
      origin: key.origin,
      libraryDocumentId: key.id,
      label:
        rows.find((row) => row.sentResume?.library?.documentId === key.id)
          ?.sentResume?.library?.label ?? null,
      sent,
      responded,
    })),
    byScore: group<"reached" | "below" | "none">((row) => [
      row.sentResume?.rating == null
        ? "none"
        : row.sentResume.rating >= reviewLoopSettings.targetRating
          ? "reached"
          : "below",
    ]).map(({ key, sent, responded }) => ({
      band: key,
      sent,
      responded,
    })),
    byFit: group((row) => [row.fitBand]).map(({ key, sent, responded }) => ({
      band: key,
      sent,
      responded,
    })),
    bySource: group((row) => [row.source]).map(({ key, sent, responded }) => ({
      source: key,
      sent,
      responded,
    })),
    medianDaysToResponse:
      medianDays === null ? null : Math.round(medianDays * 10) / 10,
    daysToResponseSample: days.length,
    highFit: {
      total: highFit.length,
      interviews: highFit.filter(interviewed).length,
    },
  };
}
