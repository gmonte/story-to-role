import { withoutDismissedFindings } from "@repo/api/domains/documents/coverage-review/finding-key";
import type { useTranslation } from "@repo/intl/use-translation";
import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";

/**
 * Whether the version's official snapshot has findings the user hasn't
 * ignored: none blocks, so it leaves once the user confirms ("Generate
 * PDF anyway").
 */
export const hasWarnings = (version: VersionView) =>
  withoutDismissedFindings(
    version.coverage?.findings ?? [],
    version.dismissedFindings
  ).length > 0;

/** Where trimming costs least: the oldest position that still has bullets. */
export function oldestWithBullets(version: VersionView) {
  if (version.content.kind !== "resume") return null;
  const entries = version.content.sections.flatMap((section) =>
    section.kind === "experience" ? section.entries : []
  );
  return entries.findLast((entry) => entry.lines.length > 0)?.employer ?? null;
}

/**
 * The finding for a document over its page limit: how many pages, and where
 * to trim. `pages` is already formatted; `measured` says the PDF was counted.
 */
export function pageLimitText(
  t: ReturnType<typeof useTranslation>,
  {
    pages,
    limit,
    measured,
    position,
  }: {
    pages: string;
    limit: number;
    measured: boolean;
    position: string | null;
  }
) {
  return t.formatMessage(
    {
      defaultMessage:
        "{count}: over the page limit this document was written with ({limit}). {advice}",
    },
    {
      count: measured
        ? t.formatMessage(
            { defaultMessage: "{pages} pages in the PDF" },
            { pages }
          )
        : t.formatMessage({ defaultMessage: "About {pages} pages" }, { pages }),
      limit,
      advice: position
        ? t.formatMessage(
            {
              defaultMessage:
                "Trim the bullets of {position}, your oldest position, or turn off an optional section.",
            },
            { position }
          )
        : t.formatMessage({
            defaultMessage: "Turn off an optional section.",
          }),
    }
  );
}
