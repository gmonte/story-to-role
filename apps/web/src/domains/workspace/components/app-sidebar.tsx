"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  KanbanSquare,
  Library,
  Plus,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTranslation } from "@repo/intl/use-translation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@repo/web/components/ui/sidebar";

import { BrandLockup } from "~/domains/brand/components/brand-lockup";
import { BrandMark } from "~/domains/brand/components/brand-mark";
import { CreditMeter } from "~/domains/credits/components/credit-meter";
import { useReminders } from "~/domains/tracker/hooks/use-tracker";
import { UserButton } from "~/domains/user/components/user-button";
import { useTRPC } from "~/tools/trpc/client";

import { LanguageSwitcher } from "./language-switcher";
import { OpeningsByStatus } from "./openings-by-status";

export function AppSidebar() {
  const t = useTranslation();
  const pathname = usePathname();
  const trpc = useTRPC();
  const { data: isAdmin } = useQuery(trpc.credits.isAdmin.queryOptions({}));
  const reminders = useReminders();

  const items = [
    {
      href: "/app/career",
      label: t.formatMessage({ defaultMessage: "My career" }),
      icon: BriefcaseBusiness,
    },
    {
      href: "/app/library",
      label: t.formatMessage({ defaultMessage: "Library" }),
      icon: Library,
    },
    {
      href: "/app/tracker",
      label: t.formatMessage({ defaultMessage: "Tracker" }),
      icon: KanbanSquare,
      count: reminders.data?.length,
    },
    {
      href: "/app/openings/new",
      label: t.formatMessage({ defaultMessage: "New opening" }),
      icon: Plus,
    },
    ...(isAdmin
      ? [
          {
            href: "/app/admin",
            label: t.formatMessage({ defaultMessage: "Admin" }),
            icon: ShieldCheck,
          },
        ]
      : []),
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/app/career" className="flex h-10 items-center px-2">
          <BrandLockup className="group-data-[collapsible=icon]:hidden" />
          <BrandMark className="hidden size-6 group-data-[collapsible=icon]:block" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
                    tooltip={item.label}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {"count" in item && !!item.count && (
                    <SidebarMenuBadge>{item.count}</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>
            {t.formatMessage({ defaultMessage: "Openings" })}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <OpeningsByStatus />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <CreditMeter />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <LanguageSwitcher />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <UserButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
