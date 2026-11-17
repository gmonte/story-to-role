import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";

/** Whether the version's official snapshot has findings that block it. */
export const hasFindings = (version: VersionView) =>
  (version.coverage?.findings.length ?? 0) > 0;

/** Where trimming costs least: the oldest position that still has bullets. */
export function oldestWithBullets(version: VersionView) {
  if (version.content.kind !== "resume") return null;
  const entries = version.content.sections.flatMap((section) =>
    section.kind === "experience" ? section.entries : []
  );
  return entries.findLast((entry) => entry.lines.length > 0)?.employer ?? null;
}
