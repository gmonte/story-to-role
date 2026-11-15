"use client";

import type { LockedFactOverrideView } from "@repo/api/domains/applications/schemas/instructions";
import { useTranslation } from "@repo/intl/use-translation";

/** Labels for application instructions and locked-fact overrides. */
export function useInstructionLabels() {
  const t = useTranslation();
  const month = (value: string | null) =>
    value
      ? t.formatDate(new Date(`${value}-01T12:00:00`), {
          month: "short",
          year: "numeric",
        })
      : t.formatMessage({ defaultMessage: "present" });

  return {
    /** "In this application, your title at X will be 'Y' instead of 'Z'." */
    override(row: LockedFactOverrideView) {
      switch (row.field) {
        case "employer":
          return t.formatMessage(
            {
              defaultMessage:
                "In this application, {original} will appear as “{value}”.",
            },
            { original: row.original ?? "", value: row.value }
          );
        case "title":
          return t.formatMessage(
            {
              defaultMessage:
                "In this application, your title at {employer} will be “{value}” instead of “{original}”.",
            },
            {
              employer: row.employer,
              value: row.value,
              original: row.original ?? "",
            }
          );
        case "start_date":
          return t.formatMessage(
            {
              defaultMessage:
                "In this application, you started at {employer} in {value} instead of {original}.",
            },
            {
              employer: row.employer,
              value: month(row.value),
              original: month(row.original),
            }
          );
        case "end_date":
          return t.formatMessage(
            {
              defaultMessage:
                "In this application, you left {employer} in {value} instead of {original}.",
            },
            {
              employer: row.employer,
              value: month(row.value),
              original: month(row.original),
            }
          );
      }
    },
  };
}
