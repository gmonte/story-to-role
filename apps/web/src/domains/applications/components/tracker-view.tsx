"use client";

import { useSyncExternalStore } from "react";

import { Columns3, List } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useTranslation } from "@repo/intl/use-translation";
import { Skeleton } from "@repo/web/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@repo/web/components/ui/tabs";
import { cn } from "@repo/web/lib/utils";

import { useTracker } from "../hooks/use-tracker";
import {
  filtersToParams,
  parseFilters,
  type ApplicationFilters,
} from "../utils/application-filters";
import { ApplicationFiltersBar, ApplicationsList } from "./applications-list";
import { ApplicationsKanban } from "./applications-kanban";
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
  const stored = useSyncExternalStore<View>(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    readStoredView,
    () => "list"
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
 * The Openings page's Tracking tab (tracker spec): the metrics, then every
 * application as a filtered list or a kanban by status.
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
    // The kanban takes the full width; the list keeps a reading width.
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 px-6",
        view === "list" && "max-w-6xl"
      )}
    >
      <TrackerMetricsPanel />

      {!tracker.data ? (
        // The view's room while the applications load: rows for the
        // list, columns of cards for the kanban.
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-44" />
          {view === "list" ? (
            [0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-14 w-full rounded-lg" />
            ))
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[3, 2, 2, 1].map((cards, column) => (
                <div key={column} className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-24" />
                  {Array.from({ length: cards }, (_, index) => (
                    <Skeleton key={index} className="h-20 w-full rounded-md" />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : applications.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center">
          {t.formatMessage({
            defaultMessage:
              "No applications yet. One starts when you generate a document for an opening, or add one you made elsewhere.",
          })}
        </p>
      ) : (
        <section className="flex min-w-0 flex-col gap-3">
          <Tabs value={view} onValueChange={(value) => setView(value as View)}>
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
    </div>
  );
}
