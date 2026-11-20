"use client";

import type { TrackedApplication } from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";

/** What comes next for an application, else when it was applied or started. */
export function ApplicationHint({
  application,
}: {
  application: TrackedApplication;
}) {
  const t = useTranslation();
  if (application.nextEvent) {
    return t.formatMessage(
      { defaultMessage: "Next: {event} on {date}" },
      {
        event:
          application.nextEvent.text ??
          t.formatMessage({ defaultMessage: "an event" }),
        date: t.formatDate(application.nextEvent.occurredAt, {
          dateStyle: "medium",
        }),
      }
    );
  }
  if (application.nextStep) {
    return t.formatMessage(
      { defaultMessage: "Next step: {step}" },
      { step: application.nextStep }
    );
  }
  if (application.appliedAt) {
    return t.formatMessage(
      { defaultMessage: "Applied on {date}" },
      { date: t.formatDate(application.appliedAt, { dateStyle: "medium" }) }
    );
  }
  return t.formatMessage(
    { defaultMessage: "Since {date}" },
    {
      date: t.formatDate(application.statusChangedAt, { dateStyle: "medium" }),
    }
  );
}
