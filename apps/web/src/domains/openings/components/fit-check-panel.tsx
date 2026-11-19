"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import Link from "next/link";

import type {
  FitCheckItemView,
  OpeningDetail,
} from "@repo/api/domains/openings/schemas/opening-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";

import { CreditCost } from "~/domains/credits/components/credit-cost";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { useTRPC } from "~/tools/trpc/client";

import { useRefreshOpenings } from "../hooks/use-opening";
import { useOpeningLabels } from "../hooks/use-opening-labels";
import { GapQuestion } from "./gap-question";

const verdictOrder = { gap: 0, partial: 1, met: 2 } as const;
const importanceOrder = { mandatory: 0, desirable: 1 } as const;

type FitItem = NonNullable<OpeningDetail["fitCheck"]>["items"][number];

/**
 * The requirements in a fixed order, the same on every load: gaps first,
 * then partial, then met; within each, mandatory before desirable, then by
 * kind and name.
 */
export function byFitOrder(a: FitItem, b: FitItem) {
  return (
    verdictOrder[a.verdict] - verdictOrder[b.verdict] ||
    importanceOrder[a.importance] - importanceOrder[b.importance] ||
    a.category.localeCompare(b.category) ||
    a.term.localeCompare(b.term) ||
    a.id.localeCompare(b.id)
  );
}

/** Gap questions the user hasn't answered yet. */
export function pendingGaps(opening: OpeningDetail) {
  return (
    opening.fitCheck?.items.filter(
      (item) => item.gapQuestion && !item.gapAnswer
    ).length ?? 0
  );
}

/** The band's colors, on a chip or a block. */
export function bandClassName(band: "high" | "medium" | "low") {
  return cn(
    band === "high" && "border-emerald-500/40 bg-emerald-500/10",
    band === "medium" && "border-amber-500/40 bg-amber-500/10",
    band === "low" && "border-red-500/40 bg-red-500/10"
  );
}

/**
 * The opening page's Fit column (workspace spec, "The opening page"): the
 * fit check's band (never a percentage) with "Check again", the job
 * preferences it breaks, and each requirement as a card with the profile
 * passages behind it and, when the opening asks for something the profile
 * doesn't show, its gap question inside the card.
 */
export function FitColumn({ opening }: { opening: OpeningDetail }) {
  const t = useTranslation();
  const labels = useOpeningLabels();
  const fitCheck = opening.fitCheck;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-medium">
        {t.formatMessage({ defaultMessage: "Fit" })}
      </h2>
      {fitCheck ? (
        <>
          <div
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-3",
              bandClassName(fitCheck.band)
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Its hint ("a hint from your profile") lives once, on the
                  header's chip. */}
              <p className="font-medium">{labels.band(fitCheck.band)}</p>
              <div className="flex items-center gap-2">
                <RunFitCheck
                  openingId={opening.id}
                  again
                  enabled
                  highlight={fitCheck.outdated}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["met", "partial", "gap"] as const).map((verdict) => (
                <Badge
                  key={verdict}
                  variant={
                    verdict === "gap"
                      ? "destructive"
                      : verdict === "met"
                        ? "default"
                        : "secondary"
                  }
                >
                  {cn(
                    t.formatNumber(
                      fitCheck.items.filter((item) => item.verdict === verdict)
                        .length
                    ),
                    labels.verdict(verdict)
                  )}
                </Badge>
              ))}
            </div>
            {/* The check is worth running again once what it read changed. */}
            {fitCheck.outdated && (
              <p className="text-xs font-medium">
                {t.formatMessage({
                  defaultMessage:
                    "This check is outdated: you answered questions, edited the description, or published your profile or job preferences again since it ran. Its status and totals don’t count that yet. Check again to include it.",
                })}
              </p>
            )}
          </div>
          {fitCheck.preferenceConflicts.length > 0 && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm">
              <p className="font-medium">
                {t.formatMessage({
                  defaultMessage: "It breaks your job preferences:",
                })}
              </p>
              <ul className="mt-1 flex flex-col gap-1 text-xs">
                {fitCheck.preferenceConflicts.map((conflict) => (
                  <li key={conflict.rule}>
                    <span className="font-medium">{conflict.rule}</span>
                    <span className="text-muted-foreground block">
                      {conflict.explanation}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {[...fitCheck.items].sort(byFitOrder).map((item) => (
              <FitCheckItem
                key={item.id}
                item={item}
                positions={fitCheck.positions}
                projects={fitCheck.projects}
              />
            ))}
          </ul>
        </>
      ) : opening.needsPublishedProfile ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4 text-sm">
          <p>
            {t.formatMessage({
              defaultMessage:
                "The fit check reads your published profile, and you haven't published one yet. Review and publish it in My career, then run the check.",
            })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/app/career">
                {t.formatMessage({ defaultMessage: "Go to My career" })}
              </Link>
            </Button>
            <RunFitCheck
              openingId={opening.id}
              enabled={opening.profilePublished}
            />
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          {opening.kind === "unsolicited"
            ? t.formatMessage({
                defaultMessage:
                  "With no vacancy there are no requirements to compare, so there's no fit check.",
              })
            : t.formatMessage({
                defaultMessage: "No fit check for this opening.",
              })}
        </p>
      )}
    </div>
  );
}

/** Runs the fit check (again) on the published profile, at its cost. */
function RunFitCheck({
  openingId,
  again = false,
  enabled,
  highlight = false,
}: {
  openingId: string;
  again?: boolean;
  // Nothing to check against until a profile is published.
  enabled: boolean;
  highlight?: boolean;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshOpenings();
  const credits = useCredits();
  const run = useMutation(
    trpc.openings.reanalyze.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );
  return (
    <>
      <Button
        size="sm"
        variant={highlight ? "default" : "outline"}
        className="h-7"
        disabled={run.isPending || !enabled}
        onClick={() => run.mutate({ openingId })}
      >
        <RotateCw className="size-3" />
        {again
          ? t.formatMessage({ defaultMessage: "Check again" })
          : t.formatMessage({ defaultMessage: "Run the fit check" })}
      </Button>
      <CreditCost credits={credits.data?.estimates.fitCheck} />
    </>
  );
}

/** Adds the opening's company to the job preferences' excluded companies. */
export function useExcludeCompany(openingId: string, company: string | null) {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const exclude = useMutation(
    trpc.openings.excludeCompany.mutationOptions({
      onSuccess: () => {
        // The preferences changed, and the checks made on the older ones
        // now say so.
        void queryClient.invalidateQueries({
          queryKey: trpc.profile.pathKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.openings.pathKey(),
        });
        toast.success(
          t.formatMessage(
            {
              defaultMessage:
                "{company} is now among your excluded companies; the next fit checks count it.",
            },
            { company }
          )
        );
      },
      onError: (error) => toast.error(error.message),
    })
  );
  return {
    disabled: !company || exclude.isPending || exclude.isSuccess,
    // The day in the user's own calendar, written next to the company.
    exclude: () =>
      exclude.mutate({
        openingId,
        date: new Date().toLocaleDateString("sv-SE"),
      }),
  };
}

function FitCheckItem({
  item,
  positions,
  projects,
}: {
  item: FitCheckItemView;
  positions: NonNullable<OpeningDetail["fitCheck"]>["positions"];
  projects: NonNullable<OpeningDetail["fitCheck"]>["projects"];
}) {
  const t = useTranslation();
  const labels = useOpeningLabels();

  return (
    <li
      id={`fit-item-${item.id}`}
      className="bg-background flex flex-col gap-1.5 rounded-lg border p-3"
    >
      <div className="flex items-center gap-1.5">
        <Badge
          variant={
            item.verdict === "gap"
              ? "destructive"
              : item.verdict === "met"
                ? "default"
                : "secondary"
          }
        >
          {labels.verdict(item.verdict)}
        </Badge>
        <span className="text-muted-foreground text-[11px]">
          {labels.category(item.category)}
        </span>
        <span className="text-muted-foreground ml-auto text-[11px]">
          {item.importance === "mandatory"
            ? t.formatMessage({ defaultMessage: "Mandatory" })
            : t.formatMessage({ defaultMessage: "Desirable" })}
        </span>
      </div>
      <p className="text-sm">{item.term}</p>
      {item.explanation && (
        <p className="text-muted-foreground text-xs">{item.explanation}</p>
      )}
      {/* The user's own answer, when the verdict rests on it and there is
          no question form showing it. */}
      {item.citesAnswer && item.gapAnswer && !item.gapQuestion && (
        <p className="bg-muted/50 rounded px-2 py-1 text-xs whitespace-pre-wrap">
          <span className="text-muted-foreground block text-[11px]">
            {t.formatMessage({
              defaultMessage: "Your answer for this opening",
            })}
          </span>
          {item.gapAnswer}
        </p>
      )}
      {/* The profile passages behind the verdict. */}
      {item.passages.map((passage) => (
        <p
          key={passage.id}
          className="bg-muted/50 rounded px-2 py-1 text-xs whitespace-pre-wrap"
        >
          {passage.text}
        </p>
      ))}
      {item.gapQuestion && (
        <GapQuestion
          fitCheckItemId={item.id}
          question={item.gapQuestion}
          answer={item.gapAnswer}
          lacks={item.gapLack}
          links={item.gapLinks}
          positions={positions}
          projects={projects}
        />
      )}
    </li>
  );
}
