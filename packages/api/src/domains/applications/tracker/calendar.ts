import {
  applicationStatusSchema,
  type ApplicationStatus,
  awaitingStatuses,
} from "../schemas/application";
import type {
  CalendarMarker,
  CalendarShow,
  Milestone,
  TrackerSettings,
} from "../schemas/tracker";

const day = 24 * 3600 * 1000;

export type CalendarOpening = {
  openingId: string;
  company: string | null;
  title: string | null;
  addedAt: Date;
  // Null for an opening with no application.
  application: {
    status: ApplicationStatus;
    appliedAt: Date | null;
    lastActivityAt: Date;
    events: Array<{
      kind: "status_change" | "note";
      occurredAt: Date;
      text: string | null;
      toStatus: ApplicationStatus | null;
    }>;
  } | null;
};

const real = (
  kind: Milestone["kind"],
  at: Date,
  over: Partial<Milestone> = {}
): Milestone => ({
  kind,
  at,
  projected: false,
  status: null,
  text: null,
  ...over,
});

/**
 * An opening's milestones (tracker spec, “Calendar”): added, applied, each
 * status change and dated note, and, only ahead, the follow-up reminder
 * and the day it would turn “No response”, from the reminder settings.
 */
export function milestonesOf(
  opening: CalendarOpening,
  settings: TrackerSettings,
  now: Date
): Milestone[] {
  const milestones = [real("added", opening.addedAt)];
  const application = opening.application;
  if (!application) return milestones;
  if (application.appliedAt) {
    milestones.push(real("applied", application.appliedAt));
  }
  for (const event of application.events) {
    if (event.kind === "note") {
      milestones.push(real("note", event.occurredAt, { text: event.text }));
    } else if (event.toStatus && event.toStatus !== "applied") {
      // Applying is its own milestone, from the day applied.
      milestones.push(
        real("status_change", event.occurredAt, { status: event.toStatus })
      );
    }
  }
  const projected = (kind: Milestone["kind"], days: number) => {
    const at = new Date(application.lastActivityAt.getTime() + days * day);
    if (at > now) milestones.push({ ...real(kind, at), projected: true });
  };
  if (awaitingStatuses.includes(application.status)) {
    if (application.status === "applied" && settings.remindersEnabled) {
      projected("follow_up", settings.followUpDays);
    }
    projected("no_response", settings.noResponseDays);
  }
  return milestones.sort((a, b) => a.at.getTime() - b.at.getTime());
}

const statusRank = (status: ApplicationStatus | null) =>
  status ? applicationStatusSchema.options.indexOf(status) : -1;

/**
 * How far along a milestone is, to label a day: a status change by the
 * funnel's order, then applying, a note, the projections, and the opening
 * added last.
 */
function advance(milestone: Milestone) {
  switch (milestone.kind) {
    case "status_change":
      return 100 + statusRank(milestone.status);
    case "applied":
      return 50;
    case "note":
      return 40;
    case "follow_up":
      return 30;
    case "no_response":
      return 20;
    case "added":
      return 0;
  }
}

/** A day as YYYY-MM-DD in a time zone. */
export function dayIn(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * The markers of a span of days (the weeks a month's grid shows): one per
 * opening per day, labelled by that day's most advanced milestone;
 * “Opening added” labels only a day it has alone. In `latest`, each
 * opening shows only its next milestone ahead (a real one before a
 * projection), else its latest one, and only when that falls in the span.
 */
export function calendarMarkers(input: {
  openings: CalendarOpening[];
  // The first and last days shown, as YYYY-MM-DD, both included.
  from: string;
  to: string;
  timeZone: string;
  show: CalendarShow;
  settings: TrackerSettings;
  now: Date;
}): CalendarMarker[] {
  const markers: CalendarMarker[] = [];
  for (const opening of input.openings) {
    const all = milestonesOf(opening, input.settings, input.now);
    const ahead = all.filter((milestone) => milestone.at > input.now);
    // What is booked (an interview) comes before what is only projected.
    const next = ahead.find((milestone) => !milestone.projected) ?? ahead.at(0);
    const latest = all.filter((milestone) => milestone.at <= input.now).at(-1);
    const shown =
      input.show === "latest" ? [next ?? latest].filter((m) => !!m) : all;
    const byDay = new Map<string, Milestone[]>();
    for (const milestone of shown) {
      const key = dayIn(milestone.at, input.timeZone);
      if (key < input.from || key > input.to) continue;
      byDay.set(key, [...(byDay.get(key) ?? []), milestone]);
    }
    for (const [key, milestones] of byDay) {
      // The opening added ranks last: it leads only a day it has alone.
      const lead = milestones.reduce((best, milestone) =>
        advance(milestone) > advance(best) ? milestone : best
      );
      markers.push({
        openingId: opening.openingId,
        company: opening.company,
        title: opening.title,
        day: key,
        lead,
        milestones,
      });
    }
  }
  return markers.sort(
    (a, b) =>
      a.day.localeCompare(b.day) || a.lead.at.getTime() - b.lead.at.getTime()
  );
}
