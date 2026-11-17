"use client";

import { useState } from "react";

import { ChevronDown, ChevronRight, Wand2 } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import type { ProfileFinding } from "@repo/api/domains/profile/truth/lint";
import { Button } from "@repo/web/components/ui/button";
import { cn } from "@repo/web/lib/utils";

import { useProfileLabels } from "../hooks/use-profile-labels";
import { useProfileEditor } from "./profile-editor-context";

// Content findings can run long on a big profile; the rest open on demand.
const shownContent = 8;

/**
 * What the linter found (profile spec, "The linter"): format findings first,
 * which block publishing, then content findings, which never do. Each opens
 * its passage; the fixable ones have "Fix format".
 */
export function ProfileFindings() {
  const t = useTranslation();
  const { findingMessage } = useProfileLabels();
  const { findings, structure, goToLine, fix, fixWholeFormat } =
    useProfileEditor();
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState(true);

  const format = findings.filter((f) => f.kind === "format");
  const content = findings.filter((f) => f.kind === "content");
  const anyFixable = findings.some((f) => f.fixable);
  if (!findings.length) {
    return (
      <p className="text-muted-foreground text-xs">
        {t.formatMessage({
          defaultMessage:
            "No findings: the profile follows the method's format.",
        })}
      </p>
    );
  }

  const item = (finding: ProfileFinding, index: number) => (
    <li
      key={`${finding.code}-${finding.line}-${finding.from}-${index}`}
      className="group"
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={() =>
            finding.line !== null &&
            goToLine(finding.line, { from: finding.from, to: finding.to })
          }
          className={cn(
            "hover:bg-muted flex-1 rounded px-2 py-1 text-left text-xs",
            finding.kind === "format"
              ? "text-destructive"
              : "text-muted-foreground"
          )}
        >
          {findingMessage(finding, structure.language)}
        </button>
        {finding.fixable && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-xs"
            onClick={() => fix(finding)}
          >
            {t.formatMessage({ defaultMessage: "Fix" })}
          </Button>
        )}
      </div>
    </li>
  );

  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-2">
        <button
          type="button"
          className="text-muted-foreground flex items-center gap-1 text-xs font-medium uppercase"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
          {t.formatMessage(
            { defaultMessage: "Findings ({count, number})" },
            { count: findings.length }
          )}
        </button>
        {anyFixable && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={fixWholeFormat}
          >
            <Wand2 className="size-3" />
            {t.formatMessage({ defaultMessage: "Fix format" })}
          </Button>
        )}
      </div>
      {open && (
        <ul className="space-y-0.5">
          {format.map(item)}
          {(showAll ? content : content.slice(0, shownContent)).map(item)}
          {!showAll && content.length > shownContent && (
            <li>
              <button
                type="button"
                className="text-primary px-2 py-1 text-xs"
                onClick={() => setShowAll(true)}
              >
                {t.formatMessage(
                  { defaultMessage: "Show {count, number} more" },
                  { count: content.length - shownContent }
                )}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
