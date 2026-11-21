"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  IdCard,
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
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@repo/web/components/ui/sidebar";
import { cn } from "@repo/web/lib/utils";

import { BrandLockup } from "~/domains/brand/components/brand-lockup";
import { BrandMark } from "~/domains/brand/components/brand-mark";
import { CreditMeter } from "~/domains/credits/components/credit-meter";
import { OutOfCreditsNotice } from "~/domains/credits/components/out-of-credits-notice";
import { useReminders } from "~/domains/applications/hooks/use-tracker";
import { UserButton } from "~/domains/user/components/user-button";
import { useTRPC } from "~/tools/trpc/client";

import { LanguageSwitcher } from "./language-switcher";
import { OpeningsByStatus } from "./openings-by-status";
import { ThemeSwitcher } from "./theme-switcher";

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
      href: "/app/linkedin",
      label: t.formatMessage({ defaultMessage: "LinkedIn" }),
      icon: IdCard,
    },
    {
      href: "/app/library",
      label: t.formatMessage({ defaultMessage: "Library" }),
      icon: Library,
    },
    {
      href: "/app/tracker",
      label: t.formatMessage({ defaultMessage: "Applications" }),
      icon: KanbanSquare,
      count: reminders.data?.length,
    },
    {
      href: "/app/openings/new",
      label: t.formatMessage({ defaultMessage: "New opening" }),
      icon: Plus,
    },
  ];
  const adminLabel = t.formatMessage({ defaultMessage: "Admin" });

  return (
    <Sidebar collapsible="icon" variant="inset">
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
              {items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        {/* ADR 0012: the orange marks where you are. */}
                        <item.icon
                          className={cn(active && "text-brand-accent")}
                        />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {"count" in item && !!item.count && (
                      <SidebarMenuBadge>{item.count}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="mx-4 group-data-[collapsible=icon]:hidden" />
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupContent>
            <OpeningsByStatus />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator className="mx-2" />
        <SidebarMenu>
          {/* Admin heads the footer: a tool apart from the work above. */}
          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith("/app/admin")}
                tooltip={adminLabel}
              >
                <Link href="/app/admin/usage">
                  <ShieldCheck />
                  <span>{adminLabel}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <CreditMeter />
            <OutOfCreditsNotice />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <LanguageSwitcher />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <ThemeSwitcher />
          </SidebarMenuItem>
          {/* The account stands apart from the settings above it. */}
          <SidebarMenuItem className="mt-3">
            <UserButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
