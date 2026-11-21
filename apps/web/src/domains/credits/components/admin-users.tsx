"use client";

import { useEffect, useState } from "react";

import { Search } from "lucide-react";

import type { AdminUser } from "@repo/api/domains/credits/schemas/credits";
import { useTranslation } from "@repo/intl/use-translation";
import { InfiniteScroll } from "@repo/web/components/pagination/infinite-scroll";
import { Badge } from "@repo/web/components/ui/badge";
import { Input } from "@repo/web/components/ui/input";
import { Skeleton } from "@repo/web/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/web/components/ui/table";

import { useAdminUsers } from "../hooks/use-admin-users";

/**
 * The admin's accounts, newest first: name, email and plan; a courtesy
 * plan runs on the user's key, so it says whether they have one.
 */
export function AdminUsers() {
  const t = useTranslation();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  // Searches once typing pauses, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const users = useAdminUsers(search);
  const plans: Record<AdminUser["plan"], string> = {
    free: t.formatMessage({ defaultMessage: "Free" }),
    subscription: t.formatMessage({ defaultMessage: "Credit subscription" }),
    own_key: t.formatMessage({ defaultMessage: "Own-key subscription" }),
    courtesy: t.formatMessage({ defaultMessage: "Courtesy" }),
  };
  const keyLabel = (status: AdminUser["keyStatus"]) =>
    ({
      active: t.formatMessage({ defaultMessage: "With a key" }),
      out_of_credit: t.formatMessage({ defaultMessage: "Key out of credit" }),
      refused: t.formatMessage({ defaultMessage: "Key refused" }),
      none: t.formatMessage({ defaultMessage: "Without a key" }),
    })[status ?? "none"];

  return (
    <div className="w-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {users.total === undefined
              ? t.formatMessage({ defaultMessage: "Users" })
              : t.formatMessage(
                  { defaultMessage: "Users ({total, number})" },
                  { total: users.total }
                )}
          </h2>
          <div className="relative w-full sm:w-72">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.formatMessage({
                defaultMessage: "Search by name or email",
              })}
              aria-label={t.formatMessage({
                defaultMessage: "Search by name or email",
              })}
              className="pl-8"
            />
          </div>
        </div>
        <div className="bg-card overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t.formatMessage({ defaultMessage: "Name" })}
                </TableHead>
                <TableHead>
                  {t.formatMessage({ defaultMessage: "Email" })}
                </TableHead>
                <TableHead>
                  {t.formatMessage({ defaultMessage: "Plan" })}
                </TableHead>
                <TableHead className="text-right">
                  {t.formatMessage({ defaultMessage: "Since" })}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.rows.map((user) => (
                <TableRow key={user.userId}>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{plans[user.plan]}</Badge>
                      {user.plan === "courtesy" && (
                        <Badge
                          variant={
                            user.keyStatus === "active"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {keyLabel(user.keyStatus)}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right">
                    {t.formatDate(user.createdAt, { dateStyle: "medium" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {users.isLoading && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-10 w-full rounded-md" />
            ))}
          </div>
        )}
        {!users.isLoading && users.rows.length === 0 && (
          <p className="text-muted-foreground">
            {t.formatMessage({ defaultMessage: "No user found." })}
          </p>
        )}
        <InfiniteScroll
          hasMore={users.hasMore}
          loadingMore={users.loadingMore}
          onLoadMore={users.fetchNextPage}
        />
      </div>
    </div>
  );
}
