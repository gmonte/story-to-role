"use client";

import { useQuery } from "@tanstack/react-query";

import type { PlatformUsage } from "@repo/api/domains/credits/schemas/usage-statement";
import { useTranslation } from "@repo/intl/use-translation";
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
