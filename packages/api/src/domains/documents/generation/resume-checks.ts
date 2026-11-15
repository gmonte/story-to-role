import type { SensitiveFilter } from "@repo/api/domains/evidence/sensitive/sensitive-filter";

import type { Line } from "../schemas/document";
import type { ResumeContent } from "../schemas/resume-content";
import type { ContextPosition } from "./load-career-context";

/** Every line of written text in a resume, in reading order. */
export function resumeLines(content: ResumeContent): Line[] {
  return content.sections.flatMap((section): Line[] => {
    switch (section.kind) {
      case "summary":
        return [section.line];
      case "skills":
        return section.groups;
      case "experience":
      case "projects":
        return section.entries.flatMap((entry) => entry.lines);
      default:
        return [];
    }
  });
}

/** The resume as plain text, as an applicant tracking system reads it. */
export function resumeText(content: ResumeContent) {
  const parts = [content.header.titleLine];
  for (const section of content.sections) {
    switch (section.kind) {
      case "summary":
        parts.push(section.line.text);
        break;
      case "skills":
        parts.push(...section.groups.map((g) => `${g.label}: ${g.text}`));
        break;
      case "experience":
        for (const entry of section.entries) {
          parts.push(entry.employer, entry.title, entry.context ?? "");
          parts.push(...entry.lines.map((line) => line.text));
        }
        break;
      case "projects":
        for (const entry of section.entries) {
          parts.push(entry.name, ...entry.lines.map((line) => line.text));
        }
        break;
      default:
        for (const entry of section.entries) {
          parts.push(entry.title, entry.institution ?? "", entry.level ?? "");
        }
    }
  }
  return parts.filter(Boolean).join("\n");
}

/**
 * Lines still carrying a generalized or excluded original (guided-interview
 * spec, "Sensitive-data control"): the output is rejected and regenerated.
 */
export function findForbiddenLines(
  content: ResumeContent,
  filter: SensitiveFilter
) {
  const written = [
    { id: "title_line", text: content.header.titleLine },
    ...resumeLines(content),
    ...content.sections.flatMap((section) =>
      section.kind === "skills"
        ? section.groups.map((group) => ({
            id: `label:${group.id}`,
            text: group.label,
          }))
        : []
    ),
    ...content.sections.flatMap((section) =>
      section.kind === "experience"
        ? section.entries.flatMap((entry) =>
            entry.context
              ? [{ id: `context:${entry.positionId}`, text: entry.context }]
              : []
          )
        : []
    ),
  ];
  return written
    .filter((line) => filter.findForbiddenTerms(line.text).length > 0)
    .map((line) => line.id);
}

/**
 * Prints the locked facts this context holds (its application's overrides
 * and title equivalents) over content written for another document, such
 * as a version reused from another application, whose overrides belong
 * to that application only.
 */
export function relockFacts(
  content: ResumeContent,
  positions: ContextPosition[]
): ResumeContent {
  return {
    ...content,
    sections: content.sections.map((section) =>
      section.kind === "experience"
        ? {
            ...section,
            entries: section.entries.map((entry) => {
              const position = positions.find(
                (row) => row.id === entry.positionId
              );
              return position
                ? {
                    ...entry,
                    employer: position.employer,
                    title: position.title,
                    startDate: position.startDate,
                    endDate: position.endDate,
                  }
                : entry;
            }),
          }
        : section
    ),
  };
}

/**
 * Positions whose employer, title or dates differ from the locked facts.
 * Code fills them, so a violation means the content was tampered with.
 */
export function lockedFactViolations(
  content: ResumeContent,
  positions: ContextPosition[],
  // Approved title equivalents in the content's language (resume spec,
  // "Adaptations"): code accepts the original title or one of these.
  acceptedTitles = new Map<string, string[]>()
) {
  return content.sections.flatMap((section) =>
    section.kind === "experience"
      ? section.entries.flatMap((entry) => {
          const position = positions.find((row) => row.id === entry.positionId);
          const intact =
            position?.employer === entry.employer &&
            (position.title === entry.title ||
              !!acceptedTitles.get(position.id)?.includes(entry.title)) &&
            position.startDate === entry.startDate &&
            position.endDate === entry.endDate;
          return intact ? [] : [entry.positionId];
        })
      : []
  );
}

/** Lines of 10pt Helvetica on an A4 page in the specified layout. */
const LINES_PER_PAGE = 54;
const CHARACTERS_PER_LINE = 100;

/**
 * An estimate of the rendered length, so generation can aim at two pages
 * and the editor can warn before the PDF exists.
 */
export function estimatePages(content: ResumeContent) {
  const wrapped = (text: string, indent = 0) =>
    Math.max(1, Math.ceil(text.length / (CHARACTERS_PER_LINE - indent)));
  let lines = 5; // name, title line, contacts, city, spacing
  for (const section of content.sections) {
    lines += 2; // title and rule
    switch (section.kind) {
      case "summary":
        lines += wrapped(section.line.text);
        break;
      case "skills":
        lines += section.groups.reduce(
          (sum, group) => sum + wrapped(`${group.label}: ${group.text}`),
          0
        );
        break;
      case "experience":
      case "projects":
        for (const entry of section.entries) {
          lines += 2.5;
          lines += entry.lines.reduce(
            (sum, line) => sum + wrapped(line.text, 6),
            0
          );
        }
        break;
      default:
        lines += section.entries.length;
    }
    lines += 1;
  }
  return Math.round((lines / LINES_PER_PAGE) * 10) / 10;
}

export const maxResumePages = 2;

/**
 * Removes bullets until the estimate fits: the last bullet of the oldest
 * position (or project) that still has more than one goes first, then the
 * single ones, oldest first. Nothing is rewritten, so every line kept
 * still rests on its evidence.
 */
export function trimToPages(content: ResumeContent, pages: number) {
  let current = content;
  while (estimatePages(current) > pages) {
    const entries = current.sections.flatMap((section, sectionIndex) =>
      section.kind === "experience" || section.kind === "projects"
        ? section.entries.map((entry, entryIndex) => ({
            sectionIndex,
            entryIndex,
            count: entry.lines.length,
          }))
        : []
    );
    // Entries are most recent first, so the oldest come last.
    const target =
      [...entries].reverse().find((entry) => entry.count > 1) ??
      [...entries].reverse().find((entry) => entry.count > 0);
    if (!target) return current;
    current = {
      ...current,
      sections: current.sections.map((section, sectionIndex) =>
        sectionIndex === target.sectionIndex &&
        (section.kind === "experience" || section.kind === "projects")
          ? ({
              ...section,
              entries: section.entries.map((entry, entryIndex) =>
                entryIndex === target.entryIndex
                  ? { ...entry, lines: entry.lines.slice(0, -1) }
                  : entry
              ),
            } as typeof section)
          : section
      ),
    };
  }
  return current;
}
