"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, RotateCw, TriangleAlert } from "lucide-react";
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

import { ApplicationContext } from "~/domains/applications/components/application-context";
import { CreditCost } from "~/domains/credits/components/credit-cost";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { CompanyResearch } from "~/domains/applications/components/company-research";
import { DocumentsPanel } from "~/domains/documents/components/documents-panel";
import { SimilarDocuments } from "~/domains/documents/components/similar-documents";
import { useTRPC } from "~/tools/trpc/client";

import { useOpening, useRefreshOpenings } from "../hooks/use-opening";
import { useOpeningLabels } from "../hooks/use-opening-labels";

const verdictOrder = { gap: 0, partial: 1, met: 2 } as const;

/** Gap questions the user hasn't answered yet. */
export function pendingGaps(opening: OpeningDetail) {
  return (
    opening.fitCheck?.items.filter(
      (item) => item.gapQuestion && !item.gapAnswer
    ).length ?? 0
  );
}

/**
 * The side panel's Analysis block: the fit check's band (never a
 * percentage), the job preferences it breaks and the method's warning
 * signs, then each requirement with the profile passages behind it.
 */
export function FitCheckPanel({ openingId }: { openingId: string }) {
  const t = useTranslation();
  const labels = useOpeningLabels();
  const opening = useOpening(openingId);
  const fitCheck = opening.data?.fitCheck;

  if (!opening.data || opening.data.status === "processing") return null;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">
          {t.formatMessage({ defaultMessage: "Analysis" })}
        </h3>
        {opening.data.warnings.length > 0 && (
          <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
            <ul className="flex flex-col gap-1">
              {opening.data.warnings.map((warning) => (
                <li key={warning}>{labels.warning(warning)}</li>
              ))}
            </ul>
          </div>
        )}
        {fitCheck ? (
          <>
            <div
              className={cn(
                "rounded-lg border p-3 text-sm font-medium",
                fitCheck.band === "high" &&
                  "border-emerald-500/40 bg-emerald-500/10",
                fitCheck.band === "medium" &&
                  "border-amber-500/40 bg-amber-500/10",
                fitCheck.band === "low" && "border-red-500/40 bg-red-500/10"
              )}
            >
              {labels.band(fitCheck.band)}
              <p className="text-muted-foreground mt-1 text-xs font-normal">
                {t.formatMessage({
                  defaultMessage:
                    "A hint from your published profile. You can apply whatever it says.",
                })}
              </p>
            </div>
            {fitCheck.preferenceConflicts.length > 0 && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-xs">
                <p className="font-medium">
                  {t.formatMessage({
                    defaultMessage: "It breaks your job preferences:",
                  })}
                </p>
                <ul className="mt-1 flex flex-col gap-1">
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
            {fitCheck.outdated && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  {t.formatMessage({
                    defaultMessage:
                      "Your profile or your job preferences were published again since this check.",
                  })}
                </span>
                <RunFitCheck openingId={openingId} again enabled />
              </div>
            )}
            <ul className="flex flex-col gap-2">
              {[...fitCheck.items]
                .sort(
                  (a, b) => verdictOrder[a.verdict] - verdictOrder[b.verdict]
                )
                .map((item) => (
                  <FitCheckItem key={item.id} item={item} />
                ))}
            </ul>
          </>
        ) : opening.data.needsPublishedProfile ? (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 text-xs">
            <p>
              {t.formatMessage({
                defaultMessage:
                  "The fit check reads your published profile, and you haven't published one yet. Review and publish it in My career, then run the check.",
              })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="outline" className="h-7">
                <Link href="/app/career">
                  {t.formatMessage({ defaultMessage: "Go to My career" })}
                </Link>
              </Button>
              <RunFitCheck
                openingId={openingId}
                enabled={opening.data.profilePublished}
              />
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            {opening.data.kind === "unsolicited"
              ? t.formatMessage({
                  defaultMessage:
                    "With no vacancy there are no requirements to compare, so there's no fit check.",
                })
              : t.formatMessage({
                  defaultMessage: "No analysis for this opening.",
                })}
          </p>
        )}
        {opening.data.status === "analyzed" && opening.data.company && (
          <ExcludeCompany
            openingId={openingId}
            company={opening.data.company}
          />
        )}
      </section>

      {opening.data.status === "analyzed" && (
        <>
          <DocumentsPanel
            openingId={openingId}
            defaultLanguage={opening.data.language ?? "en-US"}
            defaultTone={opening.data.suggestedTone ?? "your_style"}
            pendingGaps={pendingGaps(opening.data)}
          />
          <SimilarDocuments
            openingId={openingId}
            defaultLanguage={opening.data.language ?? "en-US"}
            defaultTone={opening.data.suggestedTone ?? "your_style"}
            pendingGaps={pendingGaps(opening.data)}
          />
          <ApplicationContext openingId={openingId} />
          <CompanyResearch
            openingId={openingId}
            hasCompany={!!opening.data.company}
          />
        </>
      )}
    </div>
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
function ExcludeCompany({
  openingId,
  company,
}: {
  openingId: string;
  company: string;
}) {
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
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-muted-foreground h-7 self-start text-xs"
      disabled={exclude.isPending || exclude.isSuccess}
      // The day in the user's own calendar, written next to the company.
      onClick={() =>
        exclude.mutate({
          openingId,
          date: new Date().toLocaleDateString("sv-SE"),
        })
      }
    >
      <Ban className="size-3" />
      {t.formatMessage(
        { defaultMessage: "Never recommend {company} again" },
        { company }
      )}
    </Button>
  );
}

function FitCheckItem({ item }: { item: FitCheckItemView }) {
  const t = useTranslation();
  const labels = useOpeningLabels();

  return (
    <li className="bg-background flex flex-col gap-1.5 rounded-lg border p-2.5">
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
      {/* The profile passages behind the verdict. */}
      {item.passages.map((passage) => (
        <p
          key={passage.id}
          className="bg-muted/50 rounded px-2 py-1 text-xs whitespace-pre-wrap"
        >
          {passage.text}
        </p>
      ))}
    </li>
  );
}
