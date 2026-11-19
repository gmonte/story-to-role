"use client";

import { useState } from "react";

import {
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { useProfileEditor } from "./profile-editor-context";

type Suggestion = ReturnType<typeof useProfileEditor>["suggestions"][number];

/** What a suggestion does to the text: adds, changes or removes lines. */
function kindOf(suggestion: Suggestion) {
  if (!suggestion.find.trim()) return "add";
  if (!suggestion.replace.trim()) return "remove";
  return "change";
}

/**
 * The suggestions waiting in the text (profile spec, "Suggestions"),
 * pinned to the top of the text while there are any, like a merge-conflict
 * bar: how many
 * of each kind, moving to the previous or next one, and accepting or
 * rejecting them all. One whose lines were edited away can only be
 * rejected.
 */
export function ProfileSuggestionsBar() {
  const t = useTranslation();
  const {
    suggestions,
    acceptSuggestions,
    rejectSuggestions,
    goToLine,
    scrollToLine,
  } = useProfileEditor();
  const [current, setCurrent] = useState(-1);
  const [staleOpen, setStaleOpen] = useState(false);
  if (!suggestions.length) return null;

  // In the order they appear in the text.
  const located = suggestions
    .filter((suggestion) => suggestion.range)
    .sort((a, b) => a.range!.start - b.range!.start);
  const stale = suggestions.filter((suggestion) => !suggestion.range);
  const counts = { add: 0, change: 0, remove: 0 };
  for (const suggestion of located) counts[kindOf(suggestion)]++;
  const position = Math.min(current, located.length - 1);
  const kinds = [
    counts.add > 0 &&
      t.formatMessage(
        {
          defaultMessage:
            "{count, plural, =0 {no lines to add} one {# adds a line} other {# add lines}}",
        },
        { count: counts.add }
      ),
    counts.change > 0 &&
      t.formatMessage(
        {
          defaultMessage:
            "{count, plural, =0 {no lines to change} one {# changes a line} other {# change lines}}",
        },
        { count: counts.change }
      ),
    counts.remove > 0 &&
      t.formatMessage(
        {
          defaultMessage:
            "{count, plural, =0 {no lines to remove} one {# removes a line} other {# remove lines}}",
        },
        { count: counts.remove }
      ),
  ].filter(Boolean);

  function go(step: number) {
    if (!located.length) return;
    const next =
      position < 0
        ? step > 0
          ? 0
          : located.length - 1
        : (position + step + located.length) % located.length;
    setCurrent(next);
    const line = located[next].range!.start;
    goToLine(line);
    // The caret alone may count as in view under the pinned bars: centre
    // the suggestion once the selection has moved.
    requestAnimationFrame(() => scrollToLine(line));
  }

  return (
    <div className="bg-background border-b shadow-sm">
      <div className="bg-primary/10 flex flex-col gap-2 px-4 py-2 text-xs">
        {staleOpen && stale.length > 0 && (
          <ul className="mx-auto max-h-48 w-full max-w-3xl space-y-1 overflow-y-auto">
            {stale.map((suggestion) => (
              <li
                key={suggestion.id}
                className="bg-background flex items-start gap-2 rounded border px-2 py-1"
              >
                <span className="line-clamp-2 min-w-0 flex-1 whitespace-pre-wrap">
                  {suggestion.replace || suggestion.find}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => rejectSuggestions([suggestion.id])}
                >
                  {t.formatMessage({ defaultMessage: "Reject" })}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Sparkles className="text-primary size-3.5" />
          <span>
            <span className="font-medium">
              {t.formatMessage(
                {
                  defaultMessage:
                    "{count, plural, =0 {No suggestions waiting for you} one {# suggestion waiting for you} other {# suggestions waiting for you}}",
                },
                { count: suggestions.length }
              )}
            </span>
            {/* What they do, only when they don't all do the same. */}
            {kinds.length > 1 && (
              <span className="text-muted-foreground ml-2 border-l pl-2">
                {kinds.join(" · ")}
              </span>
            )}
          </span>
          {stale.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => setStaleOpen(!staleOpen)}
            >
              <TriangleAlert className="size-3" />
              {t.formatMessage(
                {
                  defaultMessage:
                    "{count, plural, =0 {none} one {# no longer fits the text} other {# no longer fit the text}}",
                },
                { count: stale.length }
              )}
            </Button>
          )}
          {located.length > 0 && (
            <div className="flex items-center gap-0.5 border-l pl-2">
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={t.formatMessage({
                  defaultMessage: "Previous suggestion",
                })}
                onClick={() => go(-1)}
              >
                <ChevronUp className="size-3.5" />
              </Button>
              <span className="text-muted-foreground min-w-12 text-center tabular-nums">
                {t.formatMessage(
                  { defaultMessage: "{current} of {total}" },
                  {
                    current: position < 0 ? "–" : position + 1,
                    total: located.length,
                  }
                )}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={t.formatMessage({
                  defaultMessage: "Next suggestion",
                })}
                onClick={() => go(1)}
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </div>
          )}
          <div className="flex items-center gap-1 border-l pl-2">
            {located.length > 0 && (
              <Button
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => acceptSuggestions()}
              >
                <Check className="size-3" />
                {t.formatMessage({ defaultMessage: "Accept all" })}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={() => rejectSuggestions()}
            >
              <X className="size-3" />
              {t.formatMessage({ defaultMessage: "Reject all" })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
