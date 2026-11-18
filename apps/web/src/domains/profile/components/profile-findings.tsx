"use client";

import { useState } from "react";

import {
  ChevronDown,
  ChevronRight,
  EyeOff,
  MessageSquare,
  Wand2,
} from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import type { ProfileFinding } from "@repo/api/domains/profile/truth/lint";
import { Button } from "@repo/web/components/ui/button";
import { cn } from "@repo/web/lib/utils";

import { FindingQuickActions } from "./finding-quick-actions";
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
  const {
    blocks,
    findings,
    structure,
    goToLine,
    fix,
    fixWholeFormat,
    talkAbout,
    ignored,
    ignoreFinding,
    restoreFinding,
  } = useProfileEditor();
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState(true);
  const [showIgnored, setShowIgnored] = useState(false);

  const format = findings.filter((f) => f.kind === "format");
  const content = findings.filter((f) => f.kind === "content");
  const anyFixable = findings.some((f) => f.fixable);
  // The ignored ones wait here, apart from the list and its count.
  const ignoredGroup = ignored.length > 0 && (
    <div className="mt-2">
      <button
        type="button"
        className="text-muted-foreground flex items-center gap-1 text-xs font-medium uppercase"
        onClick={() => setShowIgnored((value) => !value)}
      >
        {showIgnored ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        {t.formatMessage(
          { defaultMessage: "Ignored ({count, number})" },
          { count: ignored.length }
        )}
      </button>
      {showIgnored && (
        <ul className="mt-1 space-y-0.5">
          {ignored.map((finding, index) => (
            <li
              key={`${finding.code}-${finding.line}-${finding.from}-${index}`}
              className="flex items-start gap-1"
            >
              <span className="text-muted-foreground flex-1 px-2 py-1 text-xs line-through">
                {findingMessage(finding, structure.language)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-xs"
                onClick={() => restoreFinding(finding)}
              >
                {t.formatMessage({ defaultMessage: "Restore" })}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  if (!findings.length) {
    return (
      <>
        <p className="text-muted-foreground text-xs">
          {t.formatMessage({
            defaultMessage:
              "No findings: the profile follows the method's format.",
          })}
        </p>
        {ignoredGroup}
      </>
    );
  }

  const item = (finding: ProfileFinding, index: number) => (
    <li
      key={`${finding.code}-${finding.line}-${finding.from}-${index}`}
      className="flex flex-col"
    >
      <button
        type="button"
        onClick={() =>
          finding.line !== null &&
          goToLine(finding.line, { from: finding.from, to: finding.to })
        }
        className={cn(
          "hover:bg-muted w-full rounded px-2 py-1 text-left text-xs",
          finding.kind === "format"
            ? "text-destructive"
            : "text-muted-foreground"
        )}
      >
        {findingMessage(finding, structure.language)}
      </button>
      {/* The same row for every finding: edits first, then the secondary actions. */}
      <div className="flex flex-wrap items-center gap-1 px-2 pb-1">
        <FindingQuickActions finding={finding} />
        {finding.fixable && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={() => fix(finding)}
          >
            {t.formatMessage({ defaultMessage: "Fix" })}
          </Button>
        )}
        {finding.line !== null && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground h-6 px-2 text-xs"
            title={t.formatMessage({ defaultMessage: "Talk about this" })}
            aria-label={t.formatMessage({ defaultMessage: "Talk about this" })}
            onClick={() =>
              finding.line !== null &&
              talkAbout({
                quote: blocks[finding.line].text,
                line: finding.line,
                attachment: {
                  kind: "finding",
                  text: findingMessage(finding, structure.language),
                },
              })
            }
          >
            <MessageSquare className="size-3" />
          </Button>
        )}
        {finding.kind === "content" && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground h-6 px-2 text-xs"
            title={t.formatMessage({
              defaultMessage: "This finding doesn't apply: stop showing it",
            })}
            onClick={() => ignoreFinding(finding)}
          >
            <EyeOff className="size-3" />
            {t.formatMessage({ defaultMessage: "Ignore" })}
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
      {ignoredGroup}
    </section>
  );
}
