"use client";

import { useSyncExternalStore } from "react";

import { ChevronDown, Columns3, List } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/web/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@repo/web/components/ui/tabs";
import { cn } from "@repo/web/lib/utils";

import { useBoard, useBoardQuery } from "../hooks/use-board";
import { BoardFilterBar } from "./board-filter-bar";
import { OpeningsKanban } from "./openings-kanban";
import { OpeningsList } from "./openings-list";
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

const metricsKey = "openings-metrics-open";
const metricsListeners = new Set<() => void>();

/** Whether this viewer keeps the metrics open; they start collapsed. */
function useMetricsOpen(): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(
    (listener) => {
      metricsListeners.add(listener);
      return () => metricsListeners.delete(listener);
    },
    () => {
      try {
        return localStorage.getItem(metricsKey) === "true";
      } catch {
        return false;
      }
    },
    () => false
  );
  const setOpen = (next: boolean) => {
    try {
      localStorage.setItem(metricsKey, String(next));
    } catch {
      // Not remembered.
    }
    metricsListeners.forEach((listener) => listener());
  };
  return [open, setOpen];
}

/**
 * The Openings page's Tracking tab (tracker spec, “Tracking”): the metrics
 * first (they ignore the filter), then the filter and every opening it
 * matches, as a list or a kanban.
 */
export function TrackerView() {
  const t = useTranslation();
  const [view, setView] = useView();
  const [metricsOpen, setMetricsOpen] = useMetricsOpen();
  const { filter, sort, setFilter, setSort } = useBoardQuery();
  // The list's pages; their total is the filter's count in both views.
  const board = useBoard({ filter, sort, limit: 25 });

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6">
        <Collapsible open={metricsOpen} onOpenChange={setMetricsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2">
              <ChevronDown
                className={cn(
                  "transition-transform",
                  !metricsOpen && "-rotate-90"
                )}
              />
              {t.formatMessage({ defaultMessage: "Metrics" })}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <TrackerMetricsPanel />
          </CollapsibleContent>
        </Collapsible>

        <div className="flex flex-wrap items-start justify-between gap-3">
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
        </div>
        <BoardFilterBar
          filter={filter}
          onChange={setFilter}
          total={board.total}
          {...(view === "list" ? { sort, onSortChange: setSort } : {})}
        />
        {view === "list" && <OpeningsList filter={filter} board={board} />}
      </div>
      {/* The kanban takes the full width. */}
      {view === "kanban" && (
        <div className="px-6">
          <OpeningsKanban filter={filter} />
        </div>
      )}
    </div>
  );
}
