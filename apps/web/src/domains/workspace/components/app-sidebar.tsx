"use client";

import { BriefcaseBusiness, Library, Plus } from "lucide-react";
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
  SidebarMenuButton,
  SidebarMenuItem,
} from "@repo/web/components/ui/sidebar";

import { BrandLockup } from "~/domains/brand/components/brand-lockup";
import { BrandMark } from "~/domains/brand/components/brand-mark";
import { UserButton } from "~/domains/user/components/user-button";

import { LanguageSwitcher } from "./language-switcher";
import { OpeningsByStatus } from "./openings-by-status";

export function AppSidebar() {
  const t = useTranslation();
  const pathname = usePathname();

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
      href: "/app/openings/new",
      label: t.formatMessage({ defaultMessage: "New opening" }),
      icon: Plus,
    },
  ] as const;

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
