"use client";

import { Check, Sparkles, X } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { useDocumentEditor } from "./document-editor-context";

/**
 * The agent's changes waiting in the text (ADR 0009): how many, a way to
 * the first one, and accepting or rejecting them all at once. One whose
 * lines were edited away can only be rejected.
 */
export function DocumentChangesBar() {
  const t = useTranslation();
  const { changes, acceptChanges, rejectChanges, goToBlock } =
    useDocumentEditor();
  if (!changes.length) return null;
  const located = changes.filter((change) => change.range);
  const stale = changes.length - located.length;

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
            { count: changes.length }
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
                onClick={() => goToBlock(located[0].range!.start)}
              >
                {t.formatMessage({ defaultMessage: "Show" })}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                onClick={() => acceptChanges()}
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
            onClick={() => rejectChanges()}
          >
            <X className="size-3" />
            {t.formatMessage({ defaultMessage: "Reject all" })}
          </Button>
        </div>
      </div>
      {stale > 0 && (
        <ul className="space-y-1 px-4 pb-2">
          {changes
            .filter((change) => !change.range)
            .map((change) => (
              <li
                key={change.id}
                className="bg-background flex items-start gap-2 rounded border px-2 py-1"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-muted-foreground block">
                    {t.formatMessage({
                      defaultMessage: "Can't be applied anymore",
                    })}
                  </span>
                  <span className="line-clamp-2 whitespace-pre-wrap">
                    {change.replace || change.find}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => rejectChanges([change.id])}
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
