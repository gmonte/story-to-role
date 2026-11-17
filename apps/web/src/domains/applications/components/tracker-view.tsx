"use client";

import { useState } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";

import {
  applicationStatusSchema,
  closedStatuses,
} from "@repo/api/domains/applications/schemas/application";
import type {
  TrackedApplication,
  TrackerSettings,
} from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import { Input } from "@repo/web/components/ui/input";
import { Label } from "@repo/web/components/ui/label";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshTracker, useTracker } from "../hooks/use-tracker";
import { useTrackerLabels } from "../hooks/use-tracker-labels";
import { ExternalApplicationDialog } from "./external-application-dialog";
import { ReminderList } from "./reminder-list";
import { TrackerMetricsPanel } from "./tracker-metrics-panel";

const openStatuses = applicationStatusSchema.options.filter(
  (status) => !closedStatuses.includes(status)
);

/**
 * The tracker (tracker spec): every application from its first document
 * to the outcome, by status, with the reminders on top.
 */
export function TrackerView() {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const tracker = useTracker();
  const applications = tracker.data ?? [];
  const groups = [
    ...openStatuses.map((status) => ({
      label: labels.status(status),
      items: applications.filter((row) => row.status === status),
    })),
    {
      label: t.formatMessage({ defaultMessage: "Closed" }),
      items: applications.filter((row) => closedStatuses.includes(row.status)),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 overflow-y-auto p-6 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground">
          {t.formatMessage({
            defaultMessage:
              "Every application from its first document to the outcome. Openings you only analyzed stay out of it.",
          })}
        </p>
        <ExternalApplicationDialog
          trigger={
            <Button size="sm" variant="outline">
              <Plus />
              {t.formatMessage({ defaultMessage: "Applied elsewhere" })}
            </Button>
          }
        />
      </div>

      <ReminderList />

      <TrackerMetricsPanel />

      {tracker.data && applications.length === 0 && (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center">
          {t.formatMessage({
            defaultMessage:
              "No applications yet. One starts when you generate a document for an opening, or add one you made elsewhere.",
          })}
        </p>
      )}

      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section key={group.label} className="flex flex-col gap-2">
            <h2 className="font-medium">
              {t.formatMessage(
                { defaultMessage: "{status} ({count, number})" },
                { status: group.label, count: group.items.length }
              )}
            </h2>
            <ul className="grid gap-2">
              {group.items.map((application) => (
                <ApplicationRow
                  key={application.id}
                  application={application}
                />
              ))}
            </ul>
          </section>
        ))}

      <TrackerSettingsForm />
    </div>
  );
}

function ApplicationRow({ application }: { application: TrackedApplication }) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  return (
    <li>
      <Link
        href={`/app/openings/${application.openingId}`}
        className="bg-background hover:border-primary flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
      >
        <span className="flex flex-col">
          <span className="font-medium">
            {[application.company, application.title]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span className="text-muted-foreground text-xs">
            {application.nextEvent
              ? t.formatMessage(
                  { defaultMessage: "Next: {event} on {date}" },
                  {
                    event:
                      application.nextEvent.text ??
                      t.formatMessage({ defaultMessage: "an event" }),
                    date: t.formatDate(application.nextEvent.occurredAt, {
                      dateStyle: "medium",
                    }),
                  }
                )
              : application.nextStep
                ? t.formatMessage(
                    { defaultMessage: "Next step: {step}" },
                    { step: application.nextStep }
                  )
                : application.appliedAt
                  ? t.formatMessage(
                      { defaultMessage: "Applied on {date}" },
                      {
                        date: t.formatDate(application.appliedAt, {
                          dateStyle: "medium",
                        }),
                      }
                    )
                  : t.formatMessage(
                      { defaultMessage: "Since {date}" },
                      {
                        date: t.formatDate(application.statusChangedAt, {
                          dateStyle: "medium",
                        }),
                      }
                    )}
          </span>
        </span>
        <span className="flex gap-1">
          {application.external && (
            <Badge variant="outline">
              {t.formatMessage({ defaultMessage: "Elsewhere" })}
            </Badge>
          )}
          <Badge variant="secondary">{labels.status(application.status)}</Badge>
        </span>
      </Link>
    </li>
  );
}

/** Reminders are configurable (tracker spec). */
function TrackerSettingsForm() {
  const trpc = useTRPC();
  const settings = useQuery(trpc.tracker.settings.queryOptions({}));
  if (!settings.data) return null;
  // Mounted once the settings arrive: the inputs start from them.
  return <SettingsForm initial={settings.data} />;
}

function SettingsForm({ initial }: { initial: TrackerSettings }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshTracker();
  const [value, setValue] = useState(initial);
  const save = useMutation(
    trpc.tracker.updateSettings.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(t.formatMessage({ defaultMessage: "Settings saved." }));
      },
      onError: (error) => toast.error(error.message),
    })
  );
  return (
    <form
      className="flex flex-col gap-3 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(value);
      }}
    >
      <h2 className="font-medium">
        {t.formatMessage({ defaultMessage: "Reminders" })}
      </h2>
      <label className="flex items-center gap-2">
        <Checkbox
          checked={value.remindersEnabled}
          onCheckedChange={(checked) =>
            setValue({ ...value, remindersEnabled: checked === true })
          }
        />
        {t.formatMessage({ defaultMessage: "Show reminders" })}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="follow-up-days">
            {t.formatMessage({
              defaultMessage: "Suggest a follow-up after (days)",
            })}
          </Label>
          <Input
            id="follow-up-days"
            type="number"
            min={1}
            max={90}
            value={value.followUpDays}
            onChange={(event) =>
              setValue({ ...value, followUpDays: Number(event.target.value) })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="no-response-days">
            {t.formatMessage({
              defaultMessage: "Close as “No response” after (days)",
            })}
          </Label>
          <Input
            id="no-response-days"
            type="number"
            min={7}
            max={180}
            value={value.noResponseDays}
            onChange={(event) =>
              setValue({ ...value, noResponseDays: Number(event.target.value) })
            }
          />
        </div>
      </div>
      <Button
        type="submit"
        size="sm"
        className="self-start"
        disabled={save.isPending}
      >
        {t.formatMessage({ defaultMessage: "Save" })}
      </Button>
    </form>
  );
}
