"use client";

import { useState } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";

import type { TrackerSettings } from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import { Input } from "@repo/web/components/ui/input";
import { Label } from "@repo/web/components/ui/label";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshTracker } from "../hooks/use-tracker";

/** Reminders are configurable (tracker spec). */
export function TrackerSettingsForm() {
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
      className="bg-card flex flex-col gap-3 rounded-lg border p-4"
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
