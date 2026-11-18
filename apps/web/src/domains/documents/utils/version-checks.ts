import { withoutDismissedFindings } from "@repo/api/domains/documents/coverage-review/finding-key";
import { isWarningFinding } from "@repo/api/domains/documents/coverage-review/warning-codes";
import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";

/** Whether the version's official snapshot has findings that block it. */
export const hasFindings = (version: VersionView) =>
  (version.coverage?.findings ?? []).some(
    (finding) => !isWarningFinding(finding)
  );

/**
 * Whether it has only warnings (a real name a public name should have
 * replaced) the user hasn't ignored: it can leave once the user confirms.
 */
export const hasWarnings = (version: VersionView) =>
  !hasFindings(version) &&
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
