"use client";

import { Fragment, useState } from "react";

import { ChevronDown, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type {
  UsagePayer,
  UsageStatement,
} from "@repo/api/domains/credits/schemas/usage-statement";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { Input } from "@repo/web/components/ui/input";
import { Label } from "@repo/web/components/ui/label";
import { Skeleton } from "@repo/web/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/web/components/ui/table";

import { useUsageStatement } from "../hooks/use-usage-statement";
import { usageOperationLabel } from "../utils/usage-operation-label";

const day = 24 * 3600 * 1000;

// Days are UTC days, as credit months are: a month's window shows as the
// 1st to its last day in any time zone.
/** `yyyy-mm-dd` of a date's UTC day. */
const toDay = (date: Date) => date.toISOString().slice(0, 10);

/** The UTC midnight a `yyyy-mm-dd` starts at. */
const fromDay = (value: string) => new Date(`${value}T00:00:00Z`);

/**
 * The window in the URL (`?from=…&to=…`, both days included), so a window
 * can be kept as a link; none means the plan's current credit month.
 */
function usePeriod() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const from = params.get("from");
  const to = params.get("to");
  const period =
    from && to
      ? {
          from: fromDay(from),
          to: new Date(fromDay(to).getTime() + day),
        }
      : {};
  const setPeriod = (next: { from: string; to: string } | null) => {
    const query = new URLSearchParams(params);
    query.delete("from");
    query.delete("to");
    if (next) {
      query.set("from", next.from);
      query.set("to", next.to);
    }
    const search = query.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, {
      scroll: false,
    });
  };
  return { period, setPeriod };
}

/**
 * The usage statement (billing spec, "Usage statement"): every AI
 * operation of the user in a window, who paid for it, its tokens and
 * credits, an average per kind of operation, and each operation by model.
 */
export function UsageStatementView() {
  const t = useTranslation();
  const { period, setPeriod } = usePeriod();
  const { data, isPending } = useUsageStatement(period);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 overflow-y-auto p-6 text-sm">
      <PeriodPicker statement={data} setPeriod={setPeriod} />
      {isPending || !data ? (
        <Skeleton className="h-40 w-full" />
      ) : data.operations.length === 0 ? (
        <p className="text-muted-foreground">
          {t.formatMessage({
            defaultMessage: "No AI operation in this period.",
          })}
        </p>
      ) : (
        <>
          <Totals statement={data} />
          <Summary statement={data} />
          <Operations statement={data} />
        </>
      )}
    </div>
  );
}

function PeriodPicker({
  statement,
  setPeriod,
}: {
  statement: UsageStatement | undefined;
  setPeriod: (next: { from: string; to: string } | null) => void;
}) {
  const t = useTranslation();
  if (!statement) return <Skeleton className="h-16 w-full" />;
  const from = toDay(statement.window.from);
  // The window ends at the instant after its last day.
  const to = toDay(new Date(statement.window.to.getTime() - 1));
  const today = new Date();
  const lastMonthStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)
  );
  const lastMonthEnd = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)
  );

  return (
    <section className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="usage-from">
          {t.formatMessage({ defaultMessage: "From" })}
        </Label>
        <Input
          id="usage-from"
          type="date"
          value={from}
          max={to}
          onChange={(event) =>
            event.target.value && setPeriod({ from: event.target.value, to })
          }
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="usage-to">
          {t.formatMessage({ defaultMessage: "To" })}
        </Label>
        <Input
          id="usage-to"
          type="date"
          value={to}
          min={from}
          onChange={(event) =>
            event.target.value && setPeriod({ from, to: event.target.value })
          }
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setPeriod(null)}>
          {t.formatMessage({ defaultMessage: "Current credit month" })}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setPeriod({
              from: toDay(new Date(today.getTime() - 29 * day)),
              to: toDay(today),
            })
          }
        >
          {t.formatMessage({ defaultMessage: "Last 30 days" })}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setPeriod({ from: toDay(lastMonthStart), to: toDay(lastMonthEnd) })
          }
        >
          {t.formatMessage({ defaultMessage: "Last month" })}
        </Button>
      </div>
    </section>
  );
}

function useFormats() {
  const t = useTranslation();
  return {
    tokens: (value: number) => t.formatNumber(value),
    credits: (value: number) =>
      t.formatNumber(value, { maximumFractionDigits: 1 }),
    usd: (value: number | null) =>
      value === null
        ? "—"
        : t.formatNumber(value, {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
          }),
    cache: (row: { cacheReadTokens: number; cacheWriteTokens: number }) =>
      t.formatMessage(
        { defaultMessage: "{read} / {write}" },
        {
          read: t.formatNumber(row.cacheReadTokens),
          write: t.formatNumber(row.cacheWriteTokens),
        }
      ),
    // What did not come out of the user's credits is a credit equivalent.
    rowCredits: (payer: UsagePayer, credits: number) =>
      payer === "credits"
        ? t.formatNumber(credits, { maximumFractionDigits: 1 })
        : t.formatMessage(
            { defaultMessage: "≈ {credits}" },
            { credits: t.formatNumber(credits, { maximumFractionDigits: 1 }) }
          ),
    payer: (payer: UsagePayer) =>
      ({
        credits: t.formatMessage({ defaultMessage: "Your credits" }),
        key: t.formatMessage({ defaultMessage: "Your key" }),
        storytorole: t.formatMessage({ defaultMessage: "StoryToRole" }),
      })[payer],
  };
}

function Totals({ statement }: { statement: UsageStatement }) {
  const t = useTranslation();
  const format = useFormats();
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      {statement.totals.map((total) => (
        <div
          key={total.payer}
          className="flex flex-col gap-1 rounded-lg border p-4"
        >
          <span className="text-muted-foreground text-xs">
            {format.payer(total.payer)}
          </span>
          <span className="text-lg font-medium">
            {t.formatMessage(
              { defaultMessage: "{credits} credits" },
              { credits: format.rowCredits(total.payer, total.credits) }
            )}
          </span>
          <span className="text-muted-foreground text-xs">
            {t.formatMessage(
              {
                defaultMessage:
                  "{operations, plural, one {# operation} other {# operations}} · {input} in · {output} out",
              },
              {
                operations: total.operations,
                input: format.tokens(total.inputTokens),
                output: format.tokens(total.outputTokens),
              }
            )}
          </span>
          {total.usd !== null && (
            <span className="text-muted-foreground text-xs">
              {format.usd(total.usd)}
            </span>
          )}
        </div>
      ))}
      <p className="text-muted-foreground text-xs sm:col-span-3">
        {t.formatMessage({
          defaultMessage:
            "Credits marked ≈ are a credit equivalent: what the operation would have cost in credits, since it did not come out of yours.",
        })}
      </p>
    </section>
  );
}

function Summary({ statement }: { statement: UsageStatement }) {
  const t = useTranslation();
  const format = useFormats();
  const showsUsd = statement.summary.some((row) => row.averageUsd !== null);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">
        {t.formatMessage({ defaultMessage: "Average per operation" })}
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              {t.formatMessage({ defaultMessage: "Operation" })}
            </TableHead>
            <TableHead className="text-right">
              {t.formatMessage({ defaultMessage: "Count" })}
            </TableHead>
            <TableHead className="text-right">
              {t.formatMessage({ defaultMessage: "Average credits" })}
            </TableHead>
            <TableHead className="text-right">
              {t.formatMessage({ defaultMessage: "Average tokens" })}
            </TableHead>
            {showsUsd && (
              <TableHead className="text-right">
                {t.formatMessage({ defaultMessage: "Average US$" })}
              </TableHead>
            )}
            <TableHead className="text-right">
              {t.formatMessage({ defaultMessage: "Total credits" })}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {statement.summary.map((row) => (
            <TableRow key={JSON.stringify(row.operation)}>
              <TableCell>{usageOperationLabel(t, row.operation)}</TableCell>
              <TableCell className="text-right">
                {format.tokens(row.count)}
              </TableCell>
              <TableCell className="text-right">
                {format.credits(row.averageCredits)}
              </TableCell>
              <TableCell className="text-right">
                {format.tokens(row.averageTokens)}
              </TableCell>
              {showsUsd && (
                <TableCell className="text-right">
                  {format.usd(row.averageUsd)}
                </TableCell>
              )}
              <TableCell className="text-right">
                {format.credits(row.totalCredits)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function Operations({ statement }: { statement: UsageStatement }) {
  const t = useTranslation();
  const format = useFormats();
  const [open, setOpen] = useState<string[]>([]);
  const showsUsd = statement.operations.some((row) => row.usd !== null);
  const toggle = (operationId: string) =>
    setOpen((current) =>
      current.includes(operationId)
        ? current.filter((id) => id !== operationId)
        : [...current, operationId]
    );

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">
        {t.formatMessage({ defaultMessage: "Operations" })}
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>{t.formatMessage({ defaultMessage: "When" })}</TableHead>
            <TableHead>
              {t.formatMessage({ defaultMessage: "Operation" })}
            </TableHead>
            <TableHead>
              {t.formatMessage({ defaultMessage: "Paid by" })}
            </TableHead>
            <TableHead className="text-right">
              {t.formatMessage({ defaultMessage: "Input" })}
            </TableHead>
            <TableHead className="text-right">
              {t.formatMessage({ defaultMessage: "Output" })}
            </TableHead>
            <TableHead className="text-right">
              {t.formatMessage({ defaultMessage: "Cache read / write" })}
            </TableHead>
            <TableHead className="text-right">
              {t.formatMessage({ defaultMessage: "Credits" })}
            </TableHead>
            {showsUsd && (
              <TableHead className="text-right">
                {t.formatMessage({ defaultMessage: "US$" })}
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {statement.operations.map((row) => {
            const expanded = open.includes(row.operationId);
            return (
              <Fragment key={row.operationId}>
                <TableRow>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-expanded={expanded}
                      aria-label={t.formatMessage({
                        defaultMessage: "Show by model",
                      })}
                      onClick={() => toggle(row.operationId)}
                    >
                      {expanded ? <ChevronDown /> : <ChevronRight />}
                    </Button>
                  </TableCell>
                  <TableCell>
                    {t.formatDate(row.at, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span className="flex items-center gap-2">
                      {usageOperationLabel(t, row.operation)}
                      {row.status === "failed" && (
                        <Badge variant="outline">
                          {t.formatMessage({ defaultMessage: "Failed" })}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{format.payer(row.payer)}</TableCell>
                  <TableCell className="text-right">
                    {format.tokens(row.inputTokens)}
                  </TableCell>
                  <TableCell className="text-right">
                    {format.tokens(row.outputTokens)}
                  </TableCell>
                  <TableCell className="text-right">
                    {format.cache(row)}
                  </TableCell>
                  <TableCell className="text-right">
                    {format.rowCredits(row.payer, row.credits)}
                  </TableCell>
                  {showsUsd && (
                    <TableCell className="text-right">
                      {format.usd(row.usd)}
                    </TableCell>
                  )}
                </TableRow>
                {expanded &&
                  row.models.map((model) => (
                    <TableRow
                      key={model.model}
                      className="bg-muted/30 text-muted-foreground text-xs"
                    >
                      <TableCell />
                      <TableCell />
                      <TableCell colSpan={2}>{model.model}</TableCell>
                      <TableCell className="text-right">
                        {format.tokens(model.inputTokens)}
                      </TableCell>
                      <TableCell className="text-right">
                        {format.tokens(model.outputTokens)}
                      </TableCell>
                      <TableCell className="text-right">
                        {format.cache(model)}
                      </TableCell>
                      <TableCell className="text-right">
                        {format.rowCredits(row.payer, model.credits)}
                      </TableCell>
                      {showsUsd && (
                        <TableCell className="text-right">
                          {format.usd(model.usd)}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
