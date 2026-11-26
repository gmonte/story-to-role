"use client";

import type { ComponentProps } from "react";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type {
  BoardFilter,
  BoardOpening,
} from "@repo/api/domains/applications/schemas/tracker";
import type { OpeningSummary } from "@repo/api/domains/openings/schemas/opening-view";
import { useTranslation } from "@repo/intl/use-translation";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@repo/web/components/ui/sidebar";
import { Skeleton } from "@repo/web/components/ui/skeleton";
import { cn } from "@repo/web/lib/utils";

import { useBoard } from "~/domains/applications/hooks/use-board";
import { boardQueryToParams } from "~/domains/applications/utils/board-filter";
import { useOpeningLabels } from "~/domains/openings/hooks/use-opening-labels";
import { useTRPC } from "~/tools/trpc/client";

import { sidebarBoardGroups, sidebarGroup } from "../utils/sidebar-group";

/**
 * The openings grouped by status (workspace spec): not analyzed,
 * analyzed, in preparation, applied, in process, closed, each with its three latest
 * and a title that opens the Openings page filtered the same way; openings
 * being analyzed, failed or refused never reach that page, so they are
 * all listed.
 */

const bandDot = {
  high: "bg-fit-high",
  medium: "bg-fit-mid",
  low: "bg-fit-low",
} as const;

const shown = 3;

type Row = Pick<OpeningSummary, "company" | "title" | "status"> & {
  openingId: string;
  band: OpeningSummary["band"];
};

export function OpeningsByStatus() {
  const t = useTranslation();
  const trpc = useTRPC();
  const openings = useQuery(trpc.openings.list.queryOptions({}));

  // While they load, rows in outline: never the "no openings yet" hint.
  if (openings.isPending) {
    return (
      <div className="flex flex-col gap-1">
        <Skeleton className="mx-2 mb-1 h-3 w-28" />
        {[0, 1, 2, 3, 4].map((index) => (
          <SidebarMenuSkeleton key={index} showIcon />
        ))}
      </div>
    );
  }
  if (!openings.data?.length) {
    return (
      <p className="text-muted-foreground px-2 py-1 text-xs">
        {t.formatMessage({
          defaultMessage: "Openings you add appear here, grouped by status.",
        })}
      </p>
    );
  }

  const transient = (group: string): Row[] =>
    openings.data
      .filter((opening) => sidebarGroup(opening) === group)
      .map((opening) => ({ ...opening, openingId: opening.id }));
  const labels: Record<(typeof sidebarBoardGroups)[number]["group"], string> = {
    unanalyzed: t.formatMessage({ defaultMessage: "Not analyzed" }),
    analyzed: t.formatMessage({ defaultMessage: "Analyzed openings" }),
    in_preparation: t.formatMessage({ defaultMessage: "In preparation" }),
    applied: t.formatMessage({ defaultMessage: "Applied" }),
    in_process: t.formatMessage({ defaultMessage: "In process" }),
    closed: t.formatMessage({ defaultMessage: "Closed" }),
  };
  const board = (index: number) => {
    const { group, filter } = sidebarBoardGroups[index];
    return <BoardGroup key={group} label={labels[group]} filter={filter} />;
  };

  return (
    <div className="flex flex-col gap-5">
      <Group
        label={t.formatMessage({ defaultMessage: "Openings being analyzed" })}
        rows={transient("processing")}
        total={transient("processing").length}
      />
      <Group
        label={t.formatMessage({ defaultMessage: "Analysis didn't finish" })}
        rows={transient("failed")}
        total={transient("failed").length}
      />
      {board(0)}
      {board(1)}
      {board(2)}
      {board(3)}
      {board(4)}
      <Group
        label={t.formatMessage({ defaultMessage: "Couldn't be analyzed" })}
        rows={transient("rejected")}
        total={transient("rejected").length}
      />
      {board(5)}
    </div>
  );
}

/** A group the Openings page lists: its three latest, its title a link there. */
function BoardGroup({ label, filter }: { label: string; filter: BoardFilter }) {
  const page = useBoard({ filter, sort: "activity", limit: shown });
  const rows = page.rows.slice(0, shown).map((opening: BoardOpening) => ({
    openingId: opening.openingId,
    company: opening.company,
    title: opening.title,
    status: "analyzed" as const,
    band: opening.fitBand,
  }));
  return (
    <Group
      label={label}
      rows={rows}
      total={page.total ?? 0}
      href={{
        pathname: "/app/openings",
        query: Object.fromEntries(boardQueryToParams(filter, "activity")),
      }}
    />
  );
}

function Group({
  label,
  rows,
  total,
  href,
}: {
  label: string;
  rows: Row[];
  total: number;
  // The group's title opens the Openings page filtered the same way.
  href?: ComponentProps<typeof Link>["href"];
}) {
  const t = useTranslation();
  const openingLabels = useOpeningLabels();
  const pathname = usePathname();
  if (rows.length === 0) return null;
  const heading =
    "text-muted-foreground truncate px-2 text-[11px] font-semibold tracking-[0.07em] whitespace-nowrap uppercase";
  const title = t.formatMessage(
    { defaultMessage: "{group} ({count, number})" },
    { group: label, count: total }
  );
  return (
    <div className="flex flex-col gap-1">
      {href ? (
        <Link
          href={href}
          className={cn(
            heading,
            "group/heading hover:text-foreground flex items-center gap-1"
          )}
        >
          <span className="truncate">{title}</span>
          {/* Shows, on hover, that the title opens the list. */}
          <ArrowRight
            aria-hidden="true"
            className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/heading:opacity-100 group-focus-visible/heading:opacity-100"
          />
        </Link>
      ) : (
        <span className={heading}>{title}</span>
      )}
      <SidebarMenu>
        {rows.map((opening) => {
          const href = `/app/openings/${opening.openingId}` as const;
          return (
            <SidebarMenuItem key={opening.openingId}>
              <SidebarMenuButton asChild size="sm" isActive={pathname === href}>
                <Link href={href}>
                  {/* The fit check's band at a glance; the label is the
                      dot's accessible name and tooltip. */}
                  {opening.band && (
                    <span
                      role="img"
                      aria-label={openingLabels.band(opening.band)}
                      title={openingLabels.band(opening.band)}
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        bandDot[opening.band]
                      )}
                    />
                  )}
                  <span
                    className={
                      opening.status === "processing"
                        ? "truncate motion-safe:animate-pulse"
                        : "truncate"
                    }
                  >
                    {[opening.company, opening.title]
                      .filter(Boolean)
                      .join(" · ") ||
                      (opening.status === "processing"
                        ? t.formatMessage({
                            defaultMessage: "Reading the opening…",
                          })
                        : t.formatMessage({
                            defaultMessage: "Untitled opening",
                          }))}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </div>
  );
}
