"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, RotateCw, TriangleAlert } from "lucide-react";
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
 * The Fit step (workspace spec, "The opening page"): the fit check's band
 * (never a percentage), the job preferences it breaks and the method's
 * warning signs, each requirement with the profile passages behind it,
 * and the gap questions.
 */
export function FitStep({ opening }: { opening: OpeningDetail }) {
  const t = useTranslation();
  const labels = useOpeningLabels();
  const fitCheck = opening.fitCheck;
  const gaps = fitCheck?.items.filter((item) => item.gapQuestion) ?? [];

  return (
    <div className="flex flex-col gap-6">
      {opening.warnings.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <ul className="flex flex-col gap-1">
            {opening.warnings.map((warning) => (
              <li key={warning}>{labels.warning(warning)}</li>
            ))}
          </ul>
        </div>
      )}
      {fitCheck ? (
        <>
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4",
              bandClassName(fitCheck.band)
            )}
          >
            <div>
              <p className="font-medium">{labels.band(fitCheck.band)}</p>
              <p className="text-muted-foreground text-xs">
                {t.formatMessage({
                  defaultMessage:
                    "A hint from your published profile. You can apply whatever it says.",
                })}
              </p>
            </div>
            {/* The check is worth running again only once the profile or
                the preferences moved on. */}
            {fitCheck.outdated && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  {t.formatMessage({
                    defaultMessage:
                      "Your profile or your job preferences were published again since this check.",
                  })}
                </span>
                <RunFitCheck openingId={opening.id} again enabled />
              </div>
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
          <section className="flex flex-col gap-2">
            <h3 className="font-medium">
              {t.formatMessage({ defaultMessage: "Requirements" })}
            </h3>
            <ul className="flex flex-col gap-2">
              {[...fitCheck.items]
                .sort(
                  (a, b) => verdictOrder[a.verdict] - verdictOrder[b.verdict]
                )
                .map((item) => (
                  <FitCheckItem key={item.id} item={item} />
                ))}
            </ul>
          </section>
          {gaps.length > 0 && (
            <section id="gap-questions" className="flex flex-col gap-3">
              <div>
                <h3 className="font-medium">
                  {t.formatMessage({
                    defaultMessage: "Before writing for this opening",
                  })}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {t.formatMessage({
                    defaultMessage:
                      "The opening asks for things your profile doesn't show yet. Tell us if you really lack them, or share a story.",
                  })}
                </p>
              </div>
              {gaps.map((item) => (
                <GapQuestion
                  key={item.id}
                  fitCheckItemId={item.id}
                  question={item.gapQuestion ?? ""}
                  answer={item.gapAnswer}
                  lacks={item.gapLack}
                  links={item.gapLinks}
                  positions={fitCheck.positions}
                  projects={fitCheck.projects}
                />
              ))}
            </section>
          )}
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

/**
 * The right column's Fit tab: the band and the counts, as a door to the
 * Fit step.
 */
export function FitSummary({
  opening,
  onOpen,
}: {
  opening: OpeningDetail;
  onOpen: () => void;
}) {
  const t = useTranslation();
  const labels = useOpeningLabels();
  const fitCheck = opening.fitCheck;
  if (!fitCheck) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">
          {opening.kind === "unsolicited"
            ? t.formatMessage({
                defaultMessage:
                  "With no vacancy there are no requirements to compare, so there's no fit check.",
              })
            : opening.needsPublishedProfile
              ? t.formatMessage({
                  defaultMessage:
                    "The fit check waits for a published profile.",
                })
              : t.formatMessage({
                  defaultMessage: "No fit check for this opening.",
                })}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={onOpen}
        >
          {t.formatMessage({ defaultMessage: "Open the Fit step" })}
          <ChevronRight />
        </Button>
      </div>
    );
  }
  const count = (verdict: FitCheckItemView["verdict"]) =>
    fitCheck.items.filter((item) => item.verdict === verdict).length;
  const pending = pendingGaps(opening);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full flex-col gap-2 rounded-lg border p-3 text-left text-sm",
        bandClassName(fitCheck.band)
      )}
    >
      <span className="flex items-center justify-between font-medium">
        {labels.band(fitCheck.band)}
        <ChevronRight className="text-muted-foreground size-4" />
      </span>
      <span className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span>
          {t.formatMessage(
            {
              defaultMessage:
                "{count, plural, =0 {none met} one {# met} other {# met}}",
            },
            { count: count("met") }
          )}
        </span>
        <span>
          {t.formatMessage(
            {
              defaultMessage:
                "{count, plural, =0 {none partial} one {# partial} other {# partial}}",
            },
            { count: count("partial") }
          )}
        </span>
        <span>
          {t.formatMessage(
            {
              defaultMessage:
                "{count, plural, =0 {no gaps} one {# gap} other {# gaps}}",
            },
            { count: count("gap") }
          )}
        </span>
      </span>
      {fitCheck.preferenceConflicts.length > 0 && (
        <span className="text-xs text-red-600">
          {t.formatMessage(
            {
              defaultMessage:
                "{count, plural, =0 {Breaks no job preference} one {Breaks # job preference} other {Breaks # job preferences}}",
            },
            { count: fitCheck.preferenceConflicts.length }
          )}
        </span>
      )}
      {pending > 0 && (
        <span className="text-xs font-medium">
          {t.formatMessage(
            {
              defaultMessage:
                "{count, plural, =0 {no questions to answer} one {# question to answer} other {# questions to answer}}",
            },
            { count: pending }
          )}
        </span>
      )}
      {fitCheck.outdated && (
        <span className="text-muted-foreground text-xs">
          {t.formatMessage({
            defaultMessage: "Published again since this check.",
          })}
        </span>
      )}
    </button>
  );
}

/** Runs the fit check (again) on the published profile, at its cost. */
function RunFitCheck({
  openingId,
  again = false,
  enabled,
}: {
  openingId: string;
  again?: boolean;
  // Nothing to check against until a profile is published.
  enabled: boolean;
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
        variant="outline"
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

function FitCheckItem({ item }: { item: FitCheckItemView }) {
  const t = useTranslation();
  const labels = useOpeningLabels();

  return (
    <li className="bg-background flex flex-col gap-1.5 rounded-lg border p-3">
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
      {/* The user's own answer, when the verdict rests on it. */}
      {item.citesAnswer && item.gapAnswer && (
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
      {item.gapQuestion && !item.gapAnswer && !item.gapLack && (
        <a
          href="#gap-questions"
          className="text-primary self-start text-xs underline underline-offset-2"
        >
          {t.formatMessage({ defaultMessage: "Answer its question below" })}
        </a>
      )}
    </li>
  );
}
