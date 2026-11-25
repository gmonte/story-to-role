"use client";

import { useMutation } from "@tanstack/react-query";
import { Bell, X } from "lucide-react";
import Link from "next/link";

import type { Reminder } from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshTracker, useReminders } from "../hooks/use-tracker";

/** The in-app reminders (tracker spec), each dismissible. */
export function ReminderList() {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshTracker();
  const reminders = useReminders();
  const dismiss = useMutation(
    trpc.tracker.dismissReminder.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );
  if (!reminders.data?.length) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Bell className="size-4" />
        {t.formatMessage({ defaultMessage: "Reminders" })}
      </h2>
      <ul className="flex flex-col gap-2">
        {reminders.data.map((reminder) => (
          <li
            key={reminder.key}
            className="border-warning-border bg-warning-soft flex items-start justify-between gap-2 rounded-lg border p-3 text-sm"
          >
            <Link
              href={`/app/openings/${reminder.openingId}`}
              className="hover:underline"
            >
              <ReminderText reminder={reminder} />
            </Link>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 shrink-0"
              aria-label={t.formatMessage({ defaultMessage: "Dismiss" })}
              disabled={dismiss.isPending}
              onClick={() => dismiss.mutate({ reminderKey: reminder.key })}
            >
              <X className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReminderText({ reminder }: { reminder: Reminder }) {
  const t = useTranslation();
  const company =
    reminder.company ?? t.formatMessage({ defaultMessage: "this company" });
  switch (reminder.kind) {
    case "follow_up":
      return t.formatMessage(
        {
          defaultMessage:
            "You applied to {company} {days, plural, one {# day} other {# days}} ago with no reply. Record a follow-up?",
        },
        { company, days: reminder.days }
      );
    case "upcoming_event":
      return t.formatMessage(
        { defaultMessage: "{company}: {event} on {date}" },
        {
          company,
          event:
            reminder.text ?? t.formatMessage({ defaultMessage: "an event" }),
          date: reminder.date
            ? t.formatDate(reminder.date, {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "",
        }
      );
    case "no_response_soon":
      return t.formatMessage(
        {
          defaultMessage:
            "{company} turns “No response” {days, plural, =0 {today} one {in # day} other {in # days}} unless something happens.",
        },
        { company, days: reminder.days }
      );
  }
}
