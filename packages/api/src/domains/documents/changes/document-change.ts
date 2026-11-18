import type { Line, LineOrigin } from "../schemas/document";
import type { DocumentChangeContent } from "../schemas/document-change";
import type { CoverLetterContent } from "../schemas/cover-letter-content";
import type { ResumeContent, ResumeSection } from "../schemas/resume-content";

/** The content a change can target: a resume or a cover letter. */
export type ChangeableContent = ResumeContent | CoverLetterContent;

/**
 * A change proposed to a document (ADR 0009; resume spec, "Document
 * workspace"): the lines it replaces, quoted from one part, and the lines
 * that take their place. Nothing changes until the user accepts it.
 */
export type DocumentChange = Pick<
  DocumentChangeContent,
  "part" | "find" | "replace"
>;

/**
 * A part the agent may change: the lines the user writes, grouped as the
 * editor groups them. `fixed` parts hold a set number of lines (one
 * summary, one line per skills group): their lines change, never come or
 * go. Everything outside these parts (the header, the section titles, a
 * position's facts, the credentials, a letter's greeting and closing) is
 * locked.
 */
export type DocumentPart = {
  key: string;
  title: string;
  fixed: boolean;
  lines: Line[];
};

export const summaryPart = "summary";
export const skillsPart = "skills";
export const letterPart = "letter";

/** A skills group as one line: its label, then its text. */
export const skillLine = (group: { label: string; text: string }) =>
  `${group.label}: ${group.text}`;

const lockedParts = new Set([
  "header",
  "name",
  "title_line",
  "contacts",
  "greeting",
  "closing",
  "education",
  "languages",
  "certifications",
  "publications",
  "awards",
  "volunteering",
  "courses",
]);

/** Whether a key names something only the profile changes. */
export const isLockedPart = (key: string) =>
  lockedParts.has(key.trim().toLowerCase());

export function listDocumentParts(content: ChangeableContent): DocumentPart[] {
  if (content.kind === "cover_letter") {
    return [
      {
        key: letterPart,
        title: "the letter's paragraphs",
        fixed: false,
        lines: content.paragraphs,
      },
    ];
  }
  const parts: DocumentPart[] = [];
  for (const section of content.sections) {
    switch (section.kind) {
      case "summary":
        parts.push({
          key: summaryPart,
          title: "summary",
          fixed: true,
          lines: [section.line],
        });
        break;
      case "skills":
        parts.push({
          key: skillsPart,
          title: "skills",
          fixed: true,
          lines: section.groups.map((group) => ({
            ...group,
            text: skillLine(group),
          })),
        });
        break;
      case "experience":
        for (const entry of section.entries) {
          parts.push({
            key: `experience:${entry.positionId}`,
            title: `${entry.employer} — ${entry.title}`,
            fixed: false,
            lines: entry.lines,
          });
        }
        break;
      case "projects":
        for (const entry of section.entries) {
          parts.push({
            key: `projects:${entry.projectId}`,
            title: entry.name,
            fixed: false,
            lines: entry.lines,
          });
        }
        break;
      default:
        break;
    }
  }
  return parts;
}

const lineIdPrefix = /^\[[A-Za-z0-9_-]{1,12}\]\s+/;

/**
 * A change's lines (what it replaces, or what it writes), one per line:
 * trimmed, blank ones dropped, a list marker or a line id the model
 * copied from what it read taken off.
 */
export const splitChangeLines = (text: string) =>
  text
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(lineIdPrefix, "")
        .replace(/^[-•*]\s+/, "")
        .trim()
    )
    .filter(Boolean);

const sameText = (a: string, b: string) =>
  a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

/** Where `wanted` appears as consecutive lines. */
function matches(lines: string[], wanted: string[]) {
  const found: number[] = [];
  for (let at = 0; at + wanted.length <= lines.length; at++) {
    if (wanted.every((line, offset) => sameText(lines[at + offset], line))) {
      found.push(at);
    }
  }
  return found;
}

/**
 * The lines a change replaces among a part's lines as they are now
 * ({start, end}, equal for an addition at the end), or null when it is
 * stale: its lines were edited away or appear more than once, or what it
 * adds is already there. Lines are matched by their text.
 */
export function locateInLines(
  lines: string[],
  change: Pick<DocumentChange, "find" | "replace">
): { start: number; end: number } | null {
  const wanted = splitChangeLines(change.find);
  if (!wanted.length) {
    const adding = splitChangeLines(change.replace);
    if (adding.length && matches(lines, adding).length) return null;
    return { start: lines.length, end: lines.length };
  }
  const [at, ...others] = matches(lines, wanted);
  return at === undefined || others.length
    ? null
    : { start: at, end: at + wanted.length };
}

export function locateDocumentChange(
  content: ChangeableContent,
  change: DocumentChange
): { part: DocumentPart; start: number; end: number } | null {
  const part = listDocumentParts(content).find((p) => p.key === change.part);
  if (!part) return null;
  const range = locateInLines(
    part.lines.map((line) => line.text),
    change
  );
  return range && { part, ...range };
}

/**
 * The change as the document writes it, or null when it doesn't apply:
 * its lines copied from the document, its replacement one line per line.
 */
export function normalizeDocumentChange(
  content: ChangeableContent,
  change: DocumentChange
): DocumentChange | null {
  const located = locateDocumentChange(content, change);
  if (!located) return null;
  return {
    part: change.part,
    find: located.part.lines
      .slice(located.start, located.end)
      .map((line) => line.text)
      .join("\n"),
    replace: splitChangeLines(change.replace).join("\n"),
  };
}

/** Whether two located changes rewrite some of the same lines. */
export const rangesOverlap = (
  a: { start: number; end: number },
  b: { start: number; end: number }
) => a.end > a.start && b.end > b.start && a.start < b.end && b.start < a.end;

/** A fresh line id for a line a change adds. */
export const newChangeLineId = () => crypto.randomUUID().slice(0, 8);

/**
 * The origin of a line a change writes: the profile passages the agent
 * drew on, when it named any; otherwise the line is traced to nobody but
 * the person who accepted it (the next slice points those out).
 */
export function changedLineOrigin(
  kind: ChangeableContent["kind"],
  evidenceIds: string[],
  part: string
): LineOrigin {
  if (kind === "cover_letter") {
    return evidenceIds.length
      ? {
          kind: "letter",
          evidenceIds,
          companyFactIds: [],
          motivationPointIds: [],
          instructionIds: [],
        }
      : { kind: "manual" };
  }
  if (part === skillsPart) return { kind: "skill", evidenceIds };
  return evidenceIds.length
    ? { kind: "evidence", evidenceIds }
    : { kind: "manual" };
}

/** The part's lines with the change written, keeping replaced lines' ids. */
function rewriteLines(
  lines: Line[],
  range: { start: number; end: number },
  written: string[],
  origin: LineOrigin
): Line[] {
  const replaced = lines.slice(range.start, range.end);
  const next = written.map(
    (text, index): Line => ({
      id: replaced[index]?.id ?? newChangeLineId(),
      text,
      origin,
    })
  );
  return [...lines.slice(0, range.start), ...next, ...lines.slice(range.end)];
}

/**
 * The content with the change applied, or null when it is stale, touches
 * a locked fact or changes the line count of a fixed part. Replaced lines
 * keep their ids (the findings and notes on them still point at them).
 */
export function applyDocumentChange(
  content: ChangeableContent,
  change: DocumentChange,
  evidenceIds: string[] = []
): ChangeableContent | null {
  const located = locateDocumentChange(content, change);
  if (!located) return null;
  const { part, start, end } = located;
  const written = splitChangeLines(change.replace);
  if (part.fixed && written.length !== end - start) return null;
  const origin = changedLineOrigin(content.kind, evidenceIds, part.key);
  if (content.kind === "cover_letter") {
    return {
      ...content,
      paragraphs: rewriteLines(content.paragraphs, located, written, origin),
    };
  }
  return {
    ...content,
    sections: content.sections.map((section): ResumeSection => {
      switch (section.kind) {
        case "summary":
          return part.key === summaryPart
            ? {
                ...section,
                line: { ...section.line, text: written[0], origin },
              }
            : section;
        case "skills":
          if (part.key !== skillsPart) return section;
          return {
            ...section,
            groups: section.groups.map((group, index) => {
              if (index < start || index >= end) return group;
              const line = written[index - start];
              const prefix = `${group.label}:`;
              // The label is the group's own: a line that drops it is
              // refused before it gets here.
              const text = line.startsWith(prefix)
                ? line.slice(prefix.length).trim()
                : line;
              return { ...group, text, origin };
            }),
          };
        case "experience":
          return {
            ...section,
            entries: section.entries.map((entry) =>
              part.key === `experience:${entry.positionId}`
                ? {
                    ...entry,
                    lines: rewriteLines(entry.lines, located, written, origin),
                  }
                : entry
            ),
          };
        case "projects":
          return {
            ...section,
            entries: section.entries.map((entry) =>
              part.key === `projects:${entry.projectId}`
                ? {
                    ...entry,
                    lines: rewriteLines(entry.lines, located, written, origin),
                  }
                : entry
            ),
          };
        default:
          return section;
      }
    }),
  };
}

/**
 * Why a change can't be written, beyond not applying: a skills line
 * whose label changed is a change to a locked label; a fixed part's line
 * count can't change.
 */
export function changeViolation(
  content: ChangeableContent,
  change: DocumentChange
): "locked" | "fixedLines" | null {
  const located = locateDocumentChange(content, change);
  if (!located) return null;
  const { part, start, end } = located;
  const written = splitChangeLines(change.replace);
  if (part.fixed && written.length !== end - start) return "fixedLines";
  if (part.key === skillsPart) {
    const labels = part.lines
      .slice(start, end)
      .map((line) => line.text.split(":")[0]);
    const kept = written.every((line, index) =>
      line.toLowerCase().startsWith(`${labels[index].toLowerCase()}:`)
    );
    if (!kept) return "locked";
  }
  return null;
}
