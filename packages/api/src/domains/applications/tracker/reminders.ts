import {
  type ApplicationStatus,
  awaitingStatuses,
} from "../schemas/application";
import type { Reminder, TrackerSettings } from "../schemas/tracker";

const day = 24 * 3600 * 1000;
// "Your interview is tomorrow": events within this window are reminded,
// so a morning interview shows the evening before.
const upcomingWindow = 1.5 * day;
// The warning comes this many days before "No response" closes it.
const noResponseWarningDays = 3;

type ReminderInput = {
  id: string;
  openingId: string;
  company: string | null;
  title: string | null;
  status: ApplicationStatus;
  appliedAt: Date | null;
  lastActivityAt: Date;
  nextEvent: { occurredAt: Date; text: string | null } | null;
};

/**
 * The in-app reminders (tracker spec, "Reminders"), computed from the
 * applications as they are: a follow-up nudge after days without reply,
 * a dated event coming up, and a warning before "No response" closes an
 * application (it replaces the nudge). Each has a stable key, so a
 * dismissed reminder stays dismissed until something new happens.
 */
export function computeReminders(input: {
  now: Date;
  settings: TrackerSettings;
  applications: ReminderInput[];
  dismissed?: string[];
}): Reminder[] {
  if (!input.settings.remindersEnabled) return [];
  const dismissed = new Set(input.dismissed ?? []);
  const now = input.now.getTime();

  return input.applications.flatMap((application) => {
    const about = {
      applicationId: application.id,
      openingId: application.openingId,
      company: application.company,
      title: application.title,
    };
    const reminders: Reminder[] = [];

    const event = application.nextEvent;
    if (
      event &&
      event.occurredAt.getTime() > now &&
      event.occurredAt.getTime() - now <= upcomingWindow
    ) {
      reminders.push({
        ...about,
        key: `upcoming_event:${application.id}:${event.occurredAt.toISOString()}`,
        kind: "upcoming_event",
        days: 0,
        date: event.occurredAt,
        text: event.text,
      });
    }

    if (awaitingStatuses.includes(application.status)) {
      const quiet = Math.floor(
        (now - application.lastActivityAt.getTime()) / day
      );
      const closesIn = input.settings.noResponseDays - quiet;
      // Keys carry the last activity: something new brings them back.
      const since = application.lastActivityAt.toISOString();
      if (closesIn <= noResponseWarningDays) {
        reminders.push({
          ...about,
          key: `no_response_soon:${application.id}:${since}`,
          kind: "no_response_soon",
          days: Math.max(0, closesIn),
          date: new Date(
            application.lastActivityAt.getTime() +
              input.settings.noResponseDays * day
          ),
          text: null,
        });
      } else if (
        application.status === "applied" &&
        quiet >= input.settings.followUpDays
      ) {
        const sinceApplied = application.appliedAt
          ? Math.floor((now - application.appliedAt.getTime()) / day)
          : quiet;
        reminders.push({
          ...about,
          key: `follow_up:${application.id}:${since}`,
          kind: "follow_up",
          days: sinceApplied,
          date: null,
          text: null,
        });
      }
    }
    return reminders.filter((reminder) => !dismissed.has(reminder.key));
  });
}
