"use client";

import { useSyncExternalStore } from "react";

import { Columns3, List } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useTranslation } from "@repo/intl/use-translation";
import { Tabs, TabsList, TabsTrigger } from "@repo/web/components/ui/tabs";

import { useBoard, useBoardQuery } from "../hooks/use-board";
import { BoardFilterBar } from "./board-filter-bar";
import { OpeningsKanban } from "./openings-kanban";
import { OpeningsList } from "./openings-list";

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
 * The Openings page's Tracking tab (tracker spec, “Tracking”): the filter,
 * then every opening it matches, as a list or a kanban.
 */
export function TrackerView() {
  const t = useTranslation();
  const [view, setView] = useView();
  const { filter, sort, setFilter, setSort } = useBoardQuery();
  // The list's pages; their total is the filter's count in both views.
  const board = useBoard({ filter, sort, limit: 25 });

  return (
    <div className="flex w-full flex-col gap-4">
      {/* The filter first, where the calendar has it too. */}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6">
        <BoardFilterBar
          filter={filter}
          onChange={setFilter}
          total={board.total}
          {...(view === "list" ? { sort, onSortChange: setSort } : {})}
        />
        <Tabs
          value={view}
          onValueChange={(value) => setView(value as View)}
          className="self-start"
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
