"use client";

import { Fragment, useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

import type { PlatformUsage } from "@repo/api/domains/credits/schemas/usage-statement";
import { useTranslation } from "@repo/intl/use-translation";
import { InfiniteScroll } from "@repo/web/components/pagination/infinite-scroll";
import { Button } from "@repo/web/components/ui/button";
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

import { useTRPC } from "~/tools/trpc/client";

import { usePlatformUsageUsers } from "../hooks/use-platform-usage-users";
import { usageOperationLabel } from "../utils/usage-operation-label";
import {
  PeriodPicker,
  Summary,
  Totals,
  useFormats,
  usePeriod,
} from "./usage-statement-view";

/**
 * The admin's usage statement: every user's AI operations in a window,
 * by payer, an average per kind of operation and each model's average use.
 * Without a window, the current calendar month.
 */
export function PlatformUsageView() {
  const t = useTranslation();
  const trpc = useTRPC();
  const { period, setPeriod } = usePeriod();
  const { data, isPending, error } = useQuery(
    trpc.credits.platformUsage.queryOptions(period)
  );
  if (error) {
    return (
      <p className="text-muted-foreground p-6 text-sm">
        {t.formatMessage({ defaultMessage: "This page is for admins only." })}
      </p>
    );
  }

  return (
    <div className="w-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 text-sm">
        <PeriodPicker
          statement={data}
          setPeriod={setPeriod}
          defaultLabel={t.formatMessage({ defaultMessage: "Current month" })}
        />
        {isPending || !data ? (
          <div className="flex flex-col gap-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-36 rounded-lg" />
              <Skeleton className="h-36 rounded-lg" />
              <Skeleton className="h-36 rounded-lg" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-56 w-full rounded-lg" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-40 w-full rounded-lg" />
            </div>
          </div>
        ) : data.totals.length === 0 ? (
          <p className="text-muted-foreground">
            {t.formatMessage({
              defaultMessage: "No AI operation in this period.",
            })}
          </p>
        ) : (
          <>
            <Totals statement={data} audience="everyone" />
            <Summary statement={data} />
            <ModelSummary usage={data} />
            <UserUsage period={period} />
          </>
        )}
      </div>
    </div>
  );
}

/** Each model's average use per completed operation that called it. */
function ModelSummary({ usage }: { usage: PlatformUsage }) {
  const t = useTranslation();
  const format = useFormats();
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">
        {t.formatMessage({ defaultMessage: "Average use per model" })}
      </h2>
      <div className="bg-card overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {t.formatMessage({ defaultMessage: "Model" })}
              </TableHead>
              <TableHead className="text-right">
                {t.formatMessage({ defaultMessage: "Operations" })}
              </TableHead>
              <TableHead className="text-right">
                {t.formatMessage({ defaultMessage: "Average input tokens" })}
              </TableHead>
              <TableHead className="text-right">
                {t.formatMessage({ defaultMessage: "Average output tokens" })}
              </TableHead>
              <TableHead className="text-right">
                {t.formatMessage({ defaultMessage: "Average credits" })}
              </TableHead>
              <TableHead className="text-right">
                {t.formatMessage({ defaultMessage: "Average US$" })}
              </TableHead>
              <TableHead className="text-right">
                {t.formatMessage({ defaultMessage: "Total US$" })}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usage.models.map((row) => (
              <TableRow key={row.model}>
                <TableCell className="font-mono text-xs">{row.model}</TableCell>
                <TableCell className="text-right">
                  {format.tokens(row.operations)}
                </TableCell>
                <TableCell className="text-right">
                  {format.tokens(row.averageInputTokens)}
                </TableCell>
                <TableCell className="text-right">
                  {format.tokens(row.averageOutputTokens)}
                </TableCell>
                <TableCell className="text-right">
                  {format.credits(row.averageCredits)}
                </TableCell>
                <TableCell className="text-right">
                  {format.usd(row.averageUsd)}
                </TableCell>
                <TableCell className="text-right">
                  {format.usd(row.totalUsd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

/**
 * Each user's spending, the biggest first, searched by name or email and
 * loaded as the list scrolls; a row opens into their average per kind of
 * operation.
 */
function UserUsage({ period }: { period: { from?: Date; to?: Date } }) {
  const t = useTranslation();
  const format = useFormats();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  // Searches once typing pauses, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const users = usePlatformUsageUsers({ ...period, search });
  const [open, setOpen] = useState<string[]>([]);
  const toggle = (userId: string) =>
    setOpen((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {users.total === undefined
            ? t.formatMessage({ defaultMessage: "Credits by user" })
            : t.formatMessage(
                { defaultMessage: "Credits by user ({total, number})" },
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
              <TableHead className="w-8" />
              <TableHead>
                {t.formatMessage({ defaultMessage: "User" })}
              </TableHead>
              <TableHead className="text-right">
                {t.formatMessage({ defaultMessage: "Operations" })}
              </TableHead>
              <TableHead className="text-right">
                {t.formatMessage({ defaultMessage: "Credits spent" })}
              </TableHead>
              <TableHead className="text-right">
                {t.formatMessage({ defaultMessage: "Credit equivalent" })}
              </TableHead>
              <TableHead className="text-right">
                {t.formatMessage({ defaultMessage: "US$" })}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.rows.map((user) => {
              const expanded = open.includes(user.userId);
              return (
                <Fragment key={user.userId}>
                  <TableRow>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        aria-expanded={expanded}
                        aria-label={t.formatMessage({
                          defaultMessage: "Show average per operation",
                        })}
                        onClick={() => toggle(user.userId)}
                      >
                        {expanded ? <ChevronDown /> : <ChevronRight />}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{user.name ?? user.email}</span>
                        {user.name && (
                          <span className="text-muted-foreground text-xs">
                            {user.email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {format.tokens(user.operations)}
                    </TableCell>
                    <TableCell className="text-right">
                      {format.credits(user.creditsSpent)}
                    </TableCell>
                    <TableCell className="text-right">
                      {format.rowCredits("key", user.creditEquivalent)}
                    </TableCell>
                    <TableCell className="text-right">
                      {format.usd(user.usd)}
                    </TableCell>
                  </TableRow>
                  {expanded &&
                    user.summary.map((row) => (
                      <TableRow
                        key={JSON.stringify(row.operation)}
                        className="bg-muted/30 text-muted-foreground text-xs"
                      >
                        <TableCell />
                        <TableCell className="whitespace-normal">
                          {t.formatMessage(
                            {
                              defaultMessage:
                                "{operation} · {count, plural, =0 {none} one {# time} other {# times}}",
                            },
                            {
                              operation: usageOperationLabel(t, row.operation),
                              count: row.count,
                            }
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {t.formatMessage(
                            { defaultMessage: "{tokens} tokens on average" },
                            { tokens: format.tokens(row.averageTokens) }
                          )}
                        </TableCell>
                        <TableCell colSpan={2} className="text-right">
                          {t.formatMessage(
                            { defaultMessage: "{credits} credits on average" },
                            { credits: format.credits(row.averageCredits) }
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {format.usd(row.averageUsd)}
                        </TableCell>
                      </TableRow>
                    ))}
                  {expanded && user.summary.length === 0 && (
                    <TableRow className="text-muted-foreground text-xs">
                      <TableCell />
                      <TableCell colSpan={5}>
                        {t.formatMessage({
                          defaultMessage: "No completed operation to average.",
                        })}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {users.isLoading && <Skeleton className="h-24 w-full" />}
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
    </section>
  );
}
