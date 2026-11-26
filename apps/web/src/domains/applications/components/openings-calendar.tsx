"use client";

import { useTranslation } from "@repo/intl/use-translation";

/** The Openings page's Calendar tab (tracker spec, “Calendar”). */
export function OpeningsCalendar() {
  const t = useTranslation();
  return (
    <div className="mx-auto w-full max-w-6xl px-6">
      <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center">
        {t.formatMessage({ defaultMessage: "The calendar is on its way." })}
      </p>
    </div>
  );
}
