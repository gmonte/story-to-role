"use client";

import { useTranslation } from "@repo/intl/use-translation";

/**
 * The openings grouped by status (analyzed, in preparation, applied, in
 * process, closed). Openings arrive with the fit check; until then the
 * sidebar shows where they will appear.
 */
export function OpeningsByStatus() {
  const t = useTranslation();

  return (
    <p className="text-muted-foreground px-2 py-1 text-xs">
      {t.formatMessage({
        defaultMessage:
          "Openings you add appear here, grouped by status: analyzed, in preparation, applied, in process and closed.",
      })}
    </p>
  );
}
