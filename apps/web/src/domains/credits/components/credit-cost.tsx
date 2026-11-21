"use client";

import { Coins } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { cn } from "@repo/web/lib/utils";

/**
 * "Up to N credits" (billing spec, "Estimate with a cap"): the most an
 * action may cost, shown before the user confirms it.
 */
export function CreditCost({
  credits,
  className,
}: {
  credits: number | undefined;
  className?: string;
}) {
  const t = useTranslation();
  if (credits === undefined || credits <= 0) return null;
  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex items-center gap-1 text-xs",
        className
      )}
    >
      <Coins className="text-brand-accent size-3.5" />
      {t.formatMessage(
        {
          defaultMessage:
            "Up to {credits, plural, one {# credit} other {# credits}}",
        },
        { credits }
      )}
    </span>
  );
}
