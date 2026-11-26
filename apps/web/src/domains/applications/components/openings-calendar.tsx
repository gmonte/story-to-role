"use client";

import { useEffect } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  calendarShowSchema,
  type CalendarMarker,
  type CalendarShow,
  type Milestone,
} from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/web/components/ui/popover";
import { Skeleton } from "@repo/web/components/ui/skeleton";
import { cn } from "@repo/web/lib/utils";

import { useTRPC } from "~/tools/trpc/client";

import { useBoardQuery } from "../hooks/use-board";
import { useTrackerLabels } from "../hooks/use-tracker-labels";
import {
  dayOf,
  isMonth,
  monthOf,
  monthStart,
  monthWeeks,
  shiftMonth,
} from "../utils/calendar-month";
import { applicationStatusDot } from "./application-status-badge";
import { BoardFilterBar } from "./board-filter-bar";

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The month and mode in the URL; this month and Latest or next by default. */
function useCalendarQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = params.get("month");
  const month = isMonth(fromUrl) ? fromUrl : monthOf(new Date());
  const show = calendarShowSchema.safeParse(params.get("show"));
  const set = (key: "month" | "show", value: string) => {
    const query = new URLSearchParams(params.toString());
    query.set(key, value);
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };
  return {
    month,
    show: show.success ? show.data : ("latest" as const),
    setMonth: (next: string) => set("month", next),
    setShow: (next: CalendarShow) => set("show", next),
  };
}

/**
 * The Openings page's Calendar tab (tracker spec, “Calendar”): a month of
 * milestones of the openings the filter matches, one marker per opening
 * per day; a list by day on a phone. It only shows: events are recorded on
 * the opening page.
 */
export function OpeningsCalendar() {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { filter, setFilter } = useBoardQuery();
  const { month, show, setMonth, setShow } = useCalendarQuery();
  const input = (target: string) => ({
    ...filter,
    month: target,
    timeZone: timeZone(),
    show,
  });
  const markers = useQuery(trpc.tracker.calendar.queryOptions(input(month)));
  // The months around it, so stepping through them shows at once.
  useEffect(() => {
    for (const delta of [-1, 1]) {
      void queryClient.prefetchQuery(
        trpc.tracker.calendar.queryOptions({
          ...filter,
          month: shiftMonth(month, delta),
          timeZone: timeZone(),
          show,
        })
      );
    }
  }, [queryClient, trpc, filter, month, show]);
  const showLabels: Record<CalendarShow, string> = {
    latest: t.formatMessage({ defaultMessage: "Latest or next" }),
    timeline: t.formatMessage({ defaultMessage: "Whole timeline" }),
  };

  return (
    <div className="flex w-full flex-col gap-4 px-6">
      <BoardFilterBar filter={filter} onChange={setFilter} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={t.formatMessage({ defaultMessage: "Previous month" })}
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMonth(monthOf(new Date()))}
          >
            {t.formatMessage({ defaultMessage: "Today" })}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={t.formatMessage({ defaultMessage: "Next month" })}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight />
          </Button>
          <h2 className="ml-2 text-base font-medium capitalize">
            {t.formatDate(monthStart(month), {
              month: "long",
              year: "numeric",
            })}
          </h2>
        </div>
        <div
          className="flex gap-1"
          role="radiogroup"
          aria-label={t.formatMessage({ defaultMessage: "What to show" })}
        >
          {calendarShowSchema.options.map((option) => (
            <Button
              key={option}
              size="sm"
              role="radio"
              aria-checked={show === option}
              variant={show === option ? "secondary" : "ghost"}
              onClick={() => setShow(option)}
            >
              {showLabels[option]}
            </Button>
          ))}
        </div>
      </div>

      {markers.isPending ? (
        <Skeleton className="h-[32rem] w-full rounded-lg" />
      ) : (
        <>
          <MonthGrid month={month} markers={markers.data ?? []} />
          <DayList markers={markers.data ?? []} />
        </>
      )}
    </div>
  );
}

/** The month as weeks, on a wide screen. */
function MonthGrid({
  month,
  markers,
}: {
  month: string;
  markers: CalendarMarker[];
}) {
  const t = useTranslation();
  const weeks = monthWeeks(month);
  const today = dayOf(new Date());
  return (
    <div className="hidden overflow-hidden rounded-lg border md:block">
      <div className="bg-muted/60 grid grid-cols-7 border-b">
        {weeks[0].map(({ date, day }) => (
          <div
            key={day}
            className="text-muted-foreground px-2 py-1.5 text-xs font-medium"
          >
            {t.formatDate(date, { weekday: "short" })}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div
          key={week[0].day}
          className="grid grid-cols-7 border-b last:border-b-0"
        >
          {week.map(({ day, inMonth, date }) => {
            const dayMarkers = markers.filter((marker) => marker.day === day);
            return (
              <div
                key={day}
                className={cn(
                  "flex min-h-28 min-w-0 flex-col gap-1 border-r p-1.5 last:border-r-0",
                  !inMonth && "bg-muted/30"
                )}
              >
                <span
                  className={cn(
                    "self-start rounded-sm px-1 text-xs",
                    inMonth ? "text-foreground" : "text-muted-foreground",
                    day === today &&
                      "bg-primary text-primary-foreground font-medium"
                  )}
                >
                  {t.formatDate(date, { day: "numeric" })}
                </span>
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                  {dayMarkers.map((marker) => (
                    <MarkerButton
                      key={`${marker.openingId}-${marker.day}`}
                      marker={marker}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** The month's days that hold something, as a list, on a phone. */
function DayList({ markers }: { markers: CalendarMarker[] }) {
  const t = useTranslation();
  const days = [...new Set(markers.map((marker) => marker.day))];
  if (days.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center md:hidden">
        {t.formatMessage({ defaultMessage: "Nothing this month." })}
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-4 md:hidden">
      {days.map((day) => (
        <li key={day} className="flex flex-col gap-1.5">
          <h3 className="text-muted-foreground text-xs font-medium capitalize">
            {t.formatDate(new Date(`${day}T12:00:00`), {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h3>
          {markers
            .filter((marker) => marker.day === day)
            .map((marker) => (
              <MarkerButton
                key={`${marker.openingId}-${marker.day}`}
                marker={marker}
              />
            ))}
        </li>
      ))}
    </ol>
  );
}

const kindDot: Record<Exclude<Milestone["kind"], "status_change">, string> = {
  added: "bg-status-analyzed",
  applied: "bg-status-sent",
  note: "bg-status-interview",
  follow_up: "bg-muted-foreground",
  no_response: "bg-muted-foreground",
};

function MilestoneDot({
  milestone,
  className,
}: {
  milestone: Milestone;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        className,
        milestone.kind === "status_change" && milestone.status
          ? applicationStatusDot[milestone.status]
          : kindDot[
              milestone.kind === "status_change" ? "note" : milestone.kind
            ]
      )}
    />
  );
}

function useMilestoneLabel() {
  const t = useTranslation();
  const labels = useTrackerLabels();
  return (milestone: Milestone) => {
    switch (milestone.kind) {
      case "added":
        return t.formatMessage({ defaultMessage: "Opening added" });
      case "applied":
        return t.formatMessage({ defaultMessage: "Applied" });
      case "status_change":
        return milestone.status
          ? labels.status(milestone.status)
          : t.formatMessage({ defaultMessage: "Status changed" });
      case "note":
        return milestone.text ?? t.formatMessage({ defaultMessage: "Event" });
      case "follow_up":
        return t.formatMessage({ defaultMessage: "Time to follow up" });
      case "no_response":
        return t.formatMessage({
          defaultMessage: "Turns “No response” if nothing happens",
        });
    }
  };
}

/**
 * One opening's day: the most advanced milestone, “+N” for the rest, and a
 * popover with all of them and a link to the opening. Projected ones are
 * dashed.
 */
function MarkerButton({ marker }: { marker: CalendarMarker }) {
  const t = useTranslation();
  const label = useMilestoneLabel();
  // The opening as the sidebar names it: openings at one company differ by
  // title.
  const name = [marker.company, marker.title].filter(Boolean).join(" · ");
  const more = marker.milestones.length - 1;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={name}
          className={cn(
            "bg-card hover:border-primary flex w-full min-w-0 items-start gap-1.5 rounded-md border px-1.5 py-1 text-left text-xs",
            marker.lead.projected && "border-dashed"
          )}
        >
          <MilestoneDot milestone={marker.lead} className="mt-1" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{name}</span>
            <span className="text-muted-foreground truncate">
              {label(marker.lead)}
            </span>
          </span>
          {more > 0 && (
            <span className="bg-secondary text-secondary-foreground shrink-0 rounded-sm px-1 font-mono text-[10px] font-medium">
              {t.formatMessage(
                { defaultMessage: "+{count, number}" },
                { count: more }
              )}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-72 flex-col gap-3 text-sm"
      >
        <p className="font-medium break-words">
          {[marker.company, marker.title].filter(Boolean).join(" · ")}
        </p>
        <ol className="flex flex-col gap-2">
          {marker.milestones.map((milestone, index) => (
            <li key={index} className="flex items-start gap-2">
              <MilestoneDot milestone={milestone} />
              <span className="flex min-w-0 flex-col">
                <span className="break-words">{label(milestone)}</span>
                <span className="text-muted-foreground text-xs">
                  {milestone.projected
                    ? t.formatMessage({ defaultMessage: "Expected" })
                    : t.formatDate(milestone.at, { timeStyle: "short" })}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <Button asChild size="sm" variant="outline" className="self-start">
          <Link href={`/app/openings/${marker.openingId}`}>
            {t.formatMessage({ defaultMessage: "Open the opening" })}
          </Link>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
