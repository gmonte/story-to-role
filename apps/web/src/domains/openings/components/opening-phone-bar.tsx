"use client";

import { useState, type ReactNode } from "react";

import type { OpeningDetail } from "@repo/api/domains/openings/schemas/opening-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/web/components/ui/sheet";

import { useTrackerLabels } from "~/domains/applications/hooks/use-tracker-labels";

import { useOpeningLabels } from "../hooks/use-opening-labels";
import {
  type OpeningView,
  phoneActionTarget,
  type PrimaryAction,
} from "../utils/opening-journey";
import { pendingGaps } from "./fit-check-panel";

/**
 * The opening page's bottom bar on a phone (workspace spec, "The opening
 * page"): Fit and Application each open a sheet, labelled with the band
 * and the status, and the state's next step sits beside them. Every tap
 * target is at least 44 px tall and the bar clears the home indicator.
 */
export function OpeningPhoneBar({
  opening,
  action,
  fit,
  application,
  openView,
}: {
  opening: OpeningDetail;
  action: PrimaryAction | null;
  /** The Fit column, when the opening has one. */
  fit: ReactNode;
  /** The Application column, when the opening has one. */
  application: ReactNode;
  openView: (view: Exclude<OpeningView, "opening">) => void;
}) {
  const t = useTranslation();
  const labels = useOpeningLabels();
  const trackerLabels = useTrackerLabels();
  const [sheet, setSheet] = useState<"fit" | "application" | null>(null);

  const fitLabel = opening.fitCheck
    ? labels.band(opening.fitCheck.band)
    : t.formatMessage({ defaultMessage: "Fit" });
  const applicationLabel = opening.applicationStatus
    ? trackerLabels.status(opening.applicationStatus)
    : t.formatMessage({ defaultMessage: "Application" });

  const target = phoneActionTarget(action);
  const actionLabels: Partial<Record<PrimaryAction, string>> = {
    answer_questions: t.formatMessage(
      {
        defaultMessage:
          "{count, plural, =0 {Answer questions} one {Answer # question} other {Answer # questions}}",
      },
      { count: pendingGaps(opening) }
    ),
    generate_resume: t.formatMessage({ defaultMessage: "Generate resume" }),
    write_letter: t.formatMessage({
      defaultMessage: "Write the cover letter",
    }),
    mark_applied: t.formatMessage({ defaultMessage: "Mark as applied" }),
    record_reply: t.formatMessage({ defaultMessage: "Record what happened" }),
  };
  const actionLabel = action ? actionLabels[action] : undefined;

  const sheets = [
    { key: "fit", label: fitLabel, content: fit },
    { key: "application", label: applicationLabel, content: application },
  ] as const;

  return (
    <>
      <div className="bg-background/95 flex shrink-0 gap-2 border-t px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur">
        {sheets.map(
          (item) =>
            item.content && (
              <Button
                key={item.key}
                variant="outline"
                className="h-auto min-h-11 min-w-0 flex-1 px-2 py-1.5 text-xs leading-tight whitespace-normal"
                onClick={() => setSheet(item.key)}
              >
                <span className="line-clamp-2 text-center">{item.label}</span>
              </Button>
            )
        )}
        {target && actionLabel && (
          <Button
            className="h-auto min-h-11 min-w-0 flex-[1.4] px-2 py-1.5 text-xs leading-tight whitespace-normal"
            onClick={() => {
              if (target.kind === "sheet") setSheet(target.sheet);
              else openView(target.view);
            }}
          >
            <span className="line-clamp-2 text-center">{actionLabel}</span>
          </Button>
        )}
      </div>
      <Sheet
        open={sheet !== null}
        onOpenChange={(open) => !open && setSheet(null)}
      >
        <SheetContent
          side="bottom"
          className="max-h-[88dvh] gap-0 overflow-y-auto p-4 pt-12 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>
              {sheet === "fit"
                ? t.formatMessage({ defaultMessage: "Fit" })
                : t.formatMessage({ defaultMessage: "Application" })}
            </SheetTitle>
            <SheetDescription>
              {sheet === "fit" ? fitLabel : applicationLabel}
            </SheetDescription>
          </SheetHeader>
          {sheet === "fit" ? fit : application}
        </SheetContent>
      </Sheet>
    </>
  );
}
