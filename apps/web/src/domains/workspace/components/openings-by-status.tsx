"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { OpeningSummary } from "@repo/api/domains/openings/schemas/opening-view";
import { useTranslation } from "@repo/intl/use-translation";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@repo/web/components/ui/sidebar";

import { useTRPC } from "~/tools/trpc/client";

/**
 * The openings grouped by status. Applications (slice 4) add "in
 * preparation", "applied" and "in process"; for now openings are analyzed
 * or closed.
 */
export function OpeningsByStatus() {
  const t = useTranslation();
  const trpc = useTRPC();
  const pathname = usePathname();
  const openings = useQuery(trpc.openings.list.queryOptions({}));

  if (!openings.data?.length) {
    return (
      <p className="text-muted-foreground px-2 py-1 text-xs">
        {t.formatMessage({
          defaultMessage: "Openings you add appear here, grouped by status.",
        })}
      </p>
    );
  }

  const groups: Array<{ label: string; items: OpeningSummary[] }> = [
    {
      label: t.formatMessage({ defaultMessage: "Analyzed" }),
      items: openings.data.filter((opening) => opening.status !== "closed"),
    },
    {
      label: t.formatMessage({ defaultMessage: "Closed" }),
      items: openings.data.filter((opening) => opening.status === "closed"),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <span className="text-muted-foreground px-2 text-[11px] uppercase">
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
                        <span className="truncate">
                          {[opening.company, opening.title]
                            .filter(Boolean)
                            .join(" · ") ||
                            t.formatMessage({ defaultMessage: "Reading…" })}
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
