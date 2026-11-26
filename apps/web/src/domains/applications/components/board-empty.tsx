"use client";

import type { BoardFilter } from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";

import { isDefaultBoardFilter } from "../utils/board-filter";

/** Nothing to show: none yet, or none the filter matches. */
export function BoardEmpty({ filter }: { filter: BoardFilter }) {
  const t = useTranslation();
  return (
    <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center">
      {isDefaultBoardFilter(filter)
        ? t.formatMessage({
            defaultMessage:
              "Nothing open right now. Add an opening on New opening, analyzed now or later.",
          })
        : t.formatMessage({
            defaultMessage: "No openings match this filter.",
          })}
    </p>
  );
}
