import { findQuote } from "@repo/api/utils/text/verify-quote";

import type { CareerContext } from "../generation/load-career-context";
import type { Line, LineOrigin } from "../schemas/document";
import type { DocumentContent } from "../schemas/document-content";
import { tracesToProfile } from "./check-document";

type Passage = { id: string; text: string };

// Fewer words than this match too easily ("Go") to count as a trace.
const minTraceWords = 3;

/**
 * The profile passages a line's words rest on, found by text: the line
 * holds the passage or the passage holds the line (whitespace and case may
 * differ; wording may not), as the agent's passages are resolved.
 */
export function passagesBacking(text: string, passages: Passage[]) {
  const line = text.trim();
  if (line.split(/\s+/).length < minTraceWords) return [];
  return passages
    .filter((passage) => {
      const words = passage.text.trim().split(/\s+/).filter(Boolean);
      if (words.length < minTraceWords) return false;
      return (
        findQuote(passage.text, line) !== null ||
        findQuote(line, passage.text) !== null
      );
    })
    .map((passage) => passage.id);
}

type TraceContext = Pick<CareerContext, "evidence" | "careerDirection">;

type LineKind = "evidence" | "skill" | "letter";

/** A line's origin once it traces to these profile passages. */
function tracedOrigin(as: LineKind, evidenceIds: string[]): LineOrigin {
  return as === "skill"
    ? { kind: "skill", evidenceIds }
    : as === "letter"
      ? {
          kind: "letter",
          evidenceIds,
          companyFactIds: [],
          motivationPointIds: [],
          instructionIds: [],
        }
      : { kind: "evidence", evidenceIds };
}

/** The content with each of its lines replaced by what `retrace` returns. */
function mapLines<T extends DocumentContent>(
  content: T,
  retrace: (line: Line, as: LineKind) => Line
): T {
  switch (content.kind) {
    case "cover_letter":
      return {
        ...content,
        paragraphs: content.paragraphs.map((line) => retrace(line, "letter")),
      };
    case "linkedin":
      return {
        ...content,
        about: retrace(content.about, "evidence"),
        experiences: content.experiences.map((entry) => ({
          ...entry,
          lines: entry.lines.map((line) => retrace(line, "evidence")),
        })),
        projects: content.projects.map((entry) => ({
          ...entry,
          lines: entry.lines.map((line) => retrace(line, "evidence")),
        })),
      };
    case "resume":
      return {
        ...content,
        sections: content.sections.map((section) => {
          switch (section.kind) {
            case "summary":
              return { ...section, line: retrace(section.line, "evidence") };
            case "skills":
              return {
                ...section,
                groups: section.groups.map((group) => ({
                  ...group,
                  ...retrace(group, "skill"),
                })),
              };
            case "experience":
            case "projects":
              return {
                ...section,
                entries: section.entries.map((entry) => ({
                  ...entry,
                  lines: entry.lines.map((line) => retrace(line, "evidence")),
                })),
              };
            default:
              return section;
          }
        }),
      };
  }
}

/**
 * The content with its lines traced again against another profile version
 * (resume spec, "Document workspace": "Use version N"). A line the version
 * backs keeps its trace; one it doesn't is traced to the version's
 * passages that say what the passages it cited said (a passage's id
 * changes with its text, so an untouched line of an edited passage is
 * found again by its words), then by its own words (a line the user added
 * to the profile and published), and stays as it is when none backs it.
 */
export function retraceContent<T extends DocumentContent>(
  content: T,
  versions: { from: TraceContext; to: TraceContext }
): T {
  const context = versions.to;
  const passages: Passage[] = [...context.evidence, ...context.careerDirection];
  const cited = new Map<string, string>(
    [...versions.from.evidence, ...versions.from.careerDirection].map((row) => [
      row.id,
      row.text,
    ])
  );
  const retrace = (line: Line, as: LineKind): Line => {
    if (tracesToProfile(line.origin, context)) return line;
    const citedTexts =
      line.origin && "evidenceIds" in line.origin
        ? line.origin.evidenceIds.flatMap((id) => cited.get(id) ?? [])
        : [];
    const evidenceIds = [
      ...new Set([
        ...citedTexts.flatMap((text) => passagesBacking(text, passages)),
        ...passagesBacking(line.text, passages),
      ]),
    ];
    if (!evidenceIds.length) return line;
    return { ...line, origin: tracedOrigin(as, evidenceIds) };
  };
  return mapLines(content, retrace);
}

/**
 * The content with the given lines traced to the passages a check against
 * the profile found (“Check against my profile”), by line id.
 */
export function attachTraces<T extends DocumentContent>(
  content: T,
  traces: Map<string, string[]>
): T {
  return mapLines(content, (line, as) => {
    const evidenceIds = traces.get(line.id);
    return evidenceIds?.length
      ? { ...line, origin: tracedOrigin(as, evidenceIds) }
      : line;
  });
}
