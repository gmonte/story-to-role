"use client";

import type { ReactNode } from "react";

import {
  ChartColumn,
  CalendarDays,
  KanbanSquare,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { useTranslation } from "@repo/intl/use-translation";
import { cn } from "@repo/web/lib/utils";

import {
  overviewTabHref,
  overviewTabPaths,
  type OverviewTab,
} from "../utils/overview-tabs";
import { ReminderList } from "./reminder-list";

const tabs: OverviewTab[] = ["tracking", "calendar", "metrics", "settings"];

const tabIcons: Record<OverviewTab, ReactNode> = {
  tracking: <KanbanSquare className="size-4" />,
  calendar: <CalendarDays className="size-4" />,
  metrics: <ChartColumn className="size-4" />,
  settings: <Settings className="size-4" />,
};

/**
 * The Openings page's frame (tracker spec, “The Openings page”): what it
 * holds and the reminders above the tabs, so every tab shows them. Each tab is a route; a tab's content may use the full width.
 */
export function OpeningsOverview({ children }: { children: ReactNode }) {
  const t = useTranslation();
  const pathname = usePathname();
  const params = useSearchParams();
  const current =
    tabs.find((tab) => overviewTabPaths[tab] === pathname) ?? "tracking";
  const labels: Record<OverviewTab, string> = {
    tracking: t.formatMessage({ defaultMessage: "Tracking" }),
    calendar: t.formatMessage({ defaultMessage: "Calendar" }),
    metrics: t.formatMessage({ defaultMessage: "Metrics" }),
    settings: t.formatMessage({ defaultMessage: "Settings" }),
  };

  return (
    <div className="w-full overflow-y-auto">
      <div className="flex w-full flex-col gap-6 py-6 text-sm">
        <div className="flex w-full flex-col gap-6 px-6">
          <p className="text-muted-foreground">
            {t.formatMessage({
              defaultMessage:
                "Every opening you added, from the first look to the outcome.",
            })}
          </p>

          <ReminderList />

          {/* Tabs as the opening page's: links, the open one joined to the
              line below. */}
          <nav className="flex [scrollbar-width:none] items-end gap-6 overflow-x-auto border-b [&::-webkit-scrollbar]:hidden">
            {tabs.map((tab) => {
              const active = tab === current;
              return (
                <Link
                  key={tab}
                  href={overviewTabHref(tab, params, current)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "text-muted-foreground hover:text-foreground -mb-px flex shrink-0 items-center gap-2 border-b-2 border-transparent px-1 py-2.5 text-sm transition-colors max-sm:min-h-11",
                    active && "text-foreground border-foreground font-medium"
                  )}
                >
                  {tabIcons[tab]}
                  {labels[tab]}
                </Link>
              );
            })}
          </nav>
        </div>

        {children}
      </div>
    </div>
  );
}
