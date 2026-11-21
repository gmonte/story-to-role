"use client";

import { useState, useSyncExternalStore } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Columns3, List, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { TrackerSettings } from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import { Input } from "@repo/web/components/ui/input";
import { Label } from "@repo/web/components/ui/label";
import { toast } from "@repo/web/components/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@repo/web/components/ui/tabs";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshTracker, useTracker } from "../hooks/use-tracker";
import {
  filtersToParams,
  parseFilters,
  type ApplicationFilters,
} from "../utils/application-filters";
import { ApplicationFiltersBar, ApplicationsList } from "./applications-list";
import { ApplicationsKanban } from "./applications-kanban";
import { ExternalApplicationDialog } from "./external-application-dialog";
import { ReminderList } from "./reminder-list";
import { TrackerMetricsPanel } from "./tracker-metrics-panel";

type View = "list" | "kanban";
const viewKey = "applications-view";

const listeners = new Set<() => void>();

function readStoredView(): View {
  try {
    return localStorage.getItem(viewKey) === "kanban" ? "kanban" : "list";
  } catch {
    // Private mode: the list is the default.
    return "list";
  }
}

/** The view in the URL, else the one this viewer used last. */
function useView(): [View, (view: View) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = params.get("view");
  const stored = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    readStoredView,
    () => "list" as View
  );
  const view: View =
    fromUrl === "kanban" || fromUrl === "list" ? fromUrl : stored;
  const setView = (next: View) => {
    try {
      localStorage.setItem(viewKey, next);
    } catch {
      // Not remembered.
    }
    listeners.forEach((listener) => listener());
    const query = new URLSearchParams(params.toString());
    query.set("view", next);
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };
  return [view, setView];
}

/**
 * The Applications page (tracker spec): every application from its first
 * document to the outcome, as a filtered list or a kanban by status, with
 * the reminders and metrics on top.
 */
export function TrackerView() {
  const t = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tracker = useTracker();
  const applications = tracker.data ?? [];
  const [view, setView] = useView();
  const filters = parseFilters(params);
  const setFilters = (next: ApplicationFilters) => {
    const query = new URLSearchParams(params.toString());
    for (const key of ["status", "type", "company", "sent", "sort"]) {
      query.delete(key);
    }
    for (const [key, value] of Object.entries(filtersToParams(next))) {
      query.set(key, value);
    }
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };

  return (
    <div className="w-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 text-sm">
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

        {tracker.data && applications.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center">
            {t.formatMessage({
              defaultMessage:
                "No applications yet. One starts when you generate a document for an opening, or add one you made elsewhere.",
            })}
          </p>
        ) : (
          <section className="flex min-w-0 flex-col gap-3">
            <Tabs
              value={view}
              onValueChange={(value) => setView(value as View)}
            >
              <TabsList>
                <TabsTrigger value="list">
                  <List />
                  {t.formatMessage({ defaultMessage: "List" })}
                </TabsTrigger>
                <TabsTrigger value="kanban">
                  <Columns3 />
                  {t.formatMessage({ defaultMessage: "Kanban" })}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {view === "list" ? (
              <ApplicationsList
                applications={applications}
                filters={filters}
                onFiltersChange={setFilters}
              />
            ) : (
              <div className="flex min-w-0 flex-col gap-3">
                <ApplicationFiltersBar
                  filters={filters}
                  onChange={setFilters}
                  withSort={false}
                />
                <ApplicationsKanban
                  applications={applications}
                  filters={filters}
                />
              </div>
            )}
          </section>
        )}

        <TrackerSettingsForm />
      </div>
    </div>
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
