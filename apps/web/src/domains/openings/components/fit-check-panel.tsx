"use client";

import type {
  FitCheckItemView,
  OpeningDetail,
} from "@repo/api/domains/openings/schemas/opening-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { cn } from "@repo/web/lib/utils";

import { ApplicationContext } from "~/domains/applications/components/application-context";
import { DocumentsPanel } from "~/domains/documents/components/documents-panel";

import { useOpening } from "../hooks/use-opening";
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
 * percentage), each requirement linked to its evidence, and the gaps.
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
                    "A hint from your approved evidence. You can apply whatever it says.",
                })}
              </p>
            </div>
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
      </section>

      {opening.data.status === "analyzed" && (
        <>
          <DocumentsPanel
            openingId={openingId}
            defaultLanguage={opening.data.language ?? "en-US"}
            defaultTone={opening.data.suggestedTone ?? "your_style"}
            pendingGaps={pendingGaps(opening.data)}
          />
          <ApplicationContext openingId={openingId} />
        </>
      )}
    </div>
  );
}

function FitCheckItem({ item }: { item: FitCheckItemView }) {
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
      </div>
      <p className="text-sm">{item.term}</p>
      {item.explanation && (
        <p className="text-muted-foreground text-xs">{item.explanation}</p>
      )}
      {item.evidence.map((evidence) => (
        <p key={evidence.id} className="bg-muted/50 rounded px-2 py-1 text-xs">
          {evidence.text}
        </p>
      ))}
    </li>
  );
}
