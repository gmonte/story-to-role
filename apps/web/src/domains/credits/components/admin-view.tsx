"use client";

import type { ReactNode } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTranslation } from "@repo/intl/use-translation";
import { Tabs, TabsList, TabsTrigger } from "@repo/web/components/ui/tabs";

/**
 * An admin page under the admin's tabs (everyone's AI usage, the users
 * and the courtesy grants), each tab a page of its own.
 */
export function AdminView({ children }: { children: ReactNode }) {
  const t = useTranslation();
  const pathname = usePathname();
  const tabs = [
    {
      href: "/app/admin/usage",
      label: t.formatMessage({ defaultMessage: "Usage" }),
    },
    {
      href: "/app/admin/users",
      label: t.formatMessage({ defaultMessage: "Users" }),
    },
    {
      href: "/app/admin/courtesy",
      label: t.formatMessage({ defaultMessage: "Courtesy grants" }),
    },
  ];
  const current = tabs.find((tab) => pathname.startsWith(tab.href))?.href;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs value={current}>
        <TabsList className="mx-6 mt-4">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.href} value={tab.href} asChild>
              <Link href={tab.href}>{tab.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex min-h-0 flex-1">{children}</div>
    </div>
  );
}
