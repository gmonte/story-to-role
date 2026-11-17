import type { SensitiveFilter } from "@repo/api/domains/evidence/sensitive/sensitive-filter";

import type { Line } from "../schemas/document";
import type { ExperienceAge } from "../schemas/generation-settings";
import type { ResumeContent, ResumeSection } from "../schemas/resume-content";
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

/**
 * Shortens a resume until the estimate fits, in the order the generation
 * settings give (resume spec, "Generation settings"): the bullet of a very
 * old experience that entered for relevance (it leaves with it); the
 * bullets of older experiences, oldest first; the summary down to three
 * sentences; the competencies least related to the opening, which the
 * writer lists last. The bullets of recent experiences are never cut: a
 * resume that still doesn't fit is returned as it is, for the user to be
 * warned. Nothing is rewritten, so every line kept still rests on the
 * profile.
 */
export function trimToPages(
  content: ResumeContent,
  pages: number,
  // Each position's age to this document; one not listed is recent.
  ages: Map<string, ExperienceAge>
) {
  let current = content;
  while (estimatePages(current) > pages) {
    const next = shortenOnce(current, ages);
    if (!next) return current;
    current = next;
  }
  return current;
}

const maxSummarySentences = 3;
// A resume with no competencies reads as incomplete to a screening tool.
const minSkillItems = 3;

/** One step of shortening, or null when nothing is left to cut. */
function shortenOnce(
  content: ResumeContent,
  ages: Map<string, ExperienceAge>
): ResumeContent | null {
  const mapSection = (
    kind: ResumeSection["kind"],
    change: (section: ResumeSection) => ResumeSection | null
  ): ResumeContent => ({
    ...content,
    sections: content.sections.flatMap((section) =>
      section.kind === kind ? (change(section) ?? []) : [section]
    ),
  });
  const experience = content.sections.find(
    (section) => section.kind === "experience"
  );
  const entries = experience?.kind === "experience" ? experience.entries : [];
  // Entries are most recent first, so the oldest come last.
  const fromOldest = [...entries].reverse();

  const veryOld = fromOldest.find(
    (entry) => ages.get(entry.positionId) === "very_old"
  );
  if (veryOld) {
    return mapSection("experience", (section) =>
      section.kind === "experience"
        ? {
            ...section,
            entries: section.entries.filter((entry) => entry !== veryOld),
          }
        : section
    );
  }
  const older = fromOldest.find(
    (entry) => ages.get(entry.positionId) === "older" && entry.lines.length > 0
  );
  if (older) {
    return mapSection("experience", (section) =>
      section.kind === "experience"
        ? {
            ...section,
            entries: section.entries.map((entry) =>
              entry === older
                ? { ...entry, lines: entry.lines.slice(0, -1) }
                : entry
            ),
          }
        : section
    );
  }
  const summary = content.sections.find(
    (section) => section.kind === "summary"
  );
  if (summary?.kind === "summary") {
    // A sentence ends where a new one starts with a capital letter: never
    // inside "Node.js" or "1.8 s".
    const sentences = summary.line.text.split(/(?<=[.!?])\s+(?=\p{Lu})/u);
    if (sentences.length > maxSummarySentences) {
      return mapSection("summary", (section) =>
        section.kind === "summary"
          ? {
              ...section,
              line: {
                ...section.line,
                text: sentences.slice(0, maxSummarySentences).join(" "),
              },
            }
          : section
      );
    }
  }
  const skills = content.sections.find((section) => section.kind === "skills");
  if (skills?.kind === "skills") {
    const items = skills.groups.flatMap((group) => group.text.split(", "));
    if (items.length > minSkillItems) {
      return mapSection("skills", (section) => {
        if (section.kind !== "skills") return section;
        const last = section.groups.at(-1)!;
        const kept = last.text.split(", ").slice(0, -1);
        return {
          ...section,
          groups: kept.length
            ? [
                ...section.groups.slice(0, -1),
                { ...last, text: kept.join(", ") },
              ]
            : section.groups.slice(0, -1),
        };
      });
    }
  }
  return null;
}
