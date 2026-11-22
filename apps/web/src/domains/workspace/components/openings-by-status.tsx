"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { closedStatuses } from "@repo/api/domains/applications/schemas/application";
import type { OpeningSummary } from "@repo/api/domains/openings/schemas/opening-view";
import { useTranslation } from "@repo/intl/use-translation";
import { cn } from "@repo/web/lib/utils";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@repo/web/components/ui/sidebar";
import { Skeleton } from "@repo/web/components/ui/skeleton";

import { useOpeningLabels } from "~/domains/openings/hooks/use-opening-labels";
import { useTRPC } from "~/tools/trpc/client";

/**
 * The openings grouped by status (workspace spec): analyzed, in
 * preparation, applied, in process, closed; the tracker's status places
 * an opening once it has an application.
 */

const bandDot = {
  high: "bg-fit-high",
  medium: "bg-fit-mid",
  low: "bg-fit-low",
} as const;

export function OpeningsByStatus() {
  const t = useTranslation();
  const trpc = useTRPC();
  const openingLabels = useOpeningLabels();
  const pathname = usePathname();
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

  // With an application, the tracker's status places it; without one,
  // the opening's own.
  const inGroup = (opening: OpeningSummary) => {
    const status = opening.applicationStatus;
    if (!status) return opening.status;
    if (status === "offer") return "in_process";
    if (closedStatuses.includes(status)) return "closed";
    return status;
  };
  const byGroup = (group: string) =>
    openings.data.filter((opening) => inGroup(opening) === group);
  const groups: Array<{ label: string; items: OpeningSummary[] }> = [
    {
      label: t.formatMessage({ defaultMessage: "Openings being analyzed" }),
      items: byGroup("processing"),
    },
    {
      label: t.formatMessage({ defaultMessage: "Analysis didn't finish" }),
      items: byGroup("failed"),
    },
    {
      label: t.formatMessage({ defaultMessage: "Analyzed openings" }),
      items: byGroup("analyzed"),
    },
    {
      label: t.formatMessage({ defaultMessage: "In preparation" }),
      items: byGroup("in_preparation"),
    },
    {
      label: t.formatMessage({ defaultMessage: "Applied" }),
      items: byGroup("applied"),
    },
    {
      label: t.formatMessage({ defaultMessage: "In process" }),
      items: byGroup("in_process"),
    },
    {
      label: t.formatMessage({ defaultMessage: "Couldn't be analyzed" }),
      items: byGroup("rejected"),
    },
    {
      label: t.formatMessage({ defaultMessage: "Closed" }),
      items: byGroup("closed"),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <span className="text-muted-foreground truncate px-2 text-[11px] font-semibold tracking-[0.07em] whitespace-nowrap uppercase">
              {group.label}
            </span>
            <SidebarMenu>
              {group.items.map((opening) => {
                const href = `/app/openings/${opening.id}` as const;
                return (
                  <SidebarMenuItem key={opening.id}>
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      isActive={pathname === href}
                    >
                      <Link href={href}>
                        {/* The fit check's band at a glance; the label is
                            the dot's accessible name and tooltip. */}
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
        ))}
    </div>
  );
}
