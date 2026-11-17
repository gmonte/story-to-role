"use client";

import { Check, Sparkles, X } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { useProfileEditor } from "./profile-editor-context";

/**
 * The suggestions waiting in the text (profile spec, "Suggestions"): how
 * many, a way to the next one, and accepting or rejecting them all at once.
 * One whose lines were edited away can only be rejected.
 */
export function ProfileSuggestionsBar() {
  const t = useTranslation();
  const { suggestions, acceptSuggestions, rejectSuggestions, goToLine } =
    useProfileEditor();
  if (!suggestions.length) return null;
  const located = suggestions.filter((suggestion) => suggestion.range);
  const stale = suggestions.length - located.length;

  return (
    <div className="bg-primary/5 border-b text-xs">
      <div className="flex flex-wrap items-center gap-2 px-4 py-1.5">
        <Sparkles className="text-primary size-3.5" />
        <span>
          {t.formatMessage(
            {
              defaultMessage:
                "{count, plural, =0 {No suggestions} one {# suggestion waiting} other {# suggestions waiting}}",
            },
            { count: suggestions.length }
          )}
          {stale > 0 && (
            <span className="text-muted-foreground ml-1">
              {t.formatMessage(
                {
                  defaultMessage:
                    "({count, plural, =0 {none} one {# no longer fits the text} other {# no longer fit the text}})",
                },
                { count: stale }
              )}
            </span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {located.length > 0 && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => goToLine(located[0].range!.start)}
              >
                {t.formatMessage({ defaultMessage: "Show" })}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                onClick={() => acceptSuggestions()}
              >
                <Check className="size-3" />
                {t.formatMessage({ defaultMessage: "Accept all" })}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => rejectSuggestions()}
          >
            <X className="size-3" />
            {t.formatMessage({ defaultMessage: "Reject all" })}
          </Button>
        </div>
      </div>
      {stale > 0 && (
        <ul className="space-y-1 px-4 pb-2">
          {suggestions
            .filter((suggestion) => !suggestion.range)
            .map((suggestion) => (
              <li
                key={suggestion.id}
                className="bg-background flex items-start gap-2 rounded border px-2 py-1"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-muted-foreground block">
                    {t.formatMessage({
                      defaultMessage:
                        "No longer fits the text (its lines changed):",
                    })}
                  </span>
                  <span className="line-clamp-2 whitespace-pre-wrap">
                    {suggestion.replace || suggestion.find}
                  </span>
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
    </div>
  );
}
