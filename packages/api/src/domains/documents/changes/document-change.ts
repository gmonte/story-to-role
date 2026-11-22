import type { Line, LineOrigin } from "../schemas/document";
import type { DocumentChangeContent } from "../schemas/document-change";
import { aboutParagraphs } from "../linkedin/linkedin-resume";
import type { CoverLetterContent } from "../schemas/cover-letter-content";
import { applySectionMove, sectionMoveOf } from "./section-order";
import type { LinkedinContent } from "../schemas/linkedin-content";
import type {
  ResumeContent,
  ResumeSection,
  SkillGroup,
} from "../schemas/resume-content";

/** The content a change can target: a resume, a letter or LinkedIn. */
export type ChangeableContent =
  ResumeContent | CoverLetterContent | LinkedinContent;

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
 * editor groups them, and the facts the document prints (the header, a
 * position's employer, title and context, a letter's greeting and
 * closing), which belong to the user too. `fixed` parts hold a set number
 * of lines (the header's, a position's facts): their lines change, never
 * come or go. The summary (one paragraph: an addition appends to it) and
 * the skills (one line per group: an addition is a new group) take
 * additions when asked, but are never emptied, and a skills label stays.
 * Only the section titles and the credentials are locked.
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
export const headerPart = "header";
export const greetingPart = "greeting";
export const closingPart = "closing";
// LinkedIn: the chosen headline, the About (a line per paragraph) and an
// education's description (`education:<credential id>`).
export const headlinePart = "headline";
export const aboutPart = "about";
export const educationPart = (credentialId: string) =>
  `education:${credentialId}`;
/** The key of a position's facts (employer, title, context). */
export const factsPart = (positionId: string) => `facts:${positionId}`;

/** The ids the header's lines go by, in their order. */
export const headerLineIds = {
  name: "name",
  titleLine: "title_line",
  contacts: "contacts",
  city: "city",
} as const;

/** What separates the contacts on their line. */
export const contactsSeparator = " | ";

// The text code prints has no origin of its own; the part's lines need one.
const printed: LineOrigin = { kind: "manual" };

/** The header as a fixed part: its name, title line, contacts and city. */
export function headerLines(header: {
  name: string;
  titleLine: string;
  contacts: string[];
  city: string | null;
}): Line[] {
  return [
    { id: headerLineIds.name, text: header.name, origin: printed },
    { id: headerLineIds.titleLine, text: header.titleLine, origin: printed },
    {
      id: headerLineIds.contacts,
      text: header.contacts.join(contactsSeparator),
      origin: printed,
    },
    ...(header.city === null
      ? []
      : [{ id: headerLineIds.city, text: header.city, origin: printed }]),
  ];
}

/** A position's facts as a fixed part: employer, title and context. */
export function factsLines(entry: {
  positionId: string;
  employer: string;
  title: string;
  context: string | null;
}): Line[] {
  return [
    {
      id: `employer:${entry.positionId}`,
      text: entry.employer,
      origin: printed,
    },
    { id: `title:${entry.positionId}`, text: entry.title, origin: printed },
    ...(entry.context === null
      ? []
      : [
          {
            id: `context:${entry.positionId}`,
            text: entry.context,
            origin: printed,
          },
        ]),
  ];
}

/** A skills group as one line: its label, then its text. */
export const skillLine = (group: { label: string; text: string }) =>
  `${group.label}: ${group.text}`;

const lockedParts = new Set([
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

/**
 * Whether a part holds locked facts (the header, a position's employer,
 * title and context): the person may change them, and the agent may
 * suggest changing one only when the person asked for that change.
 */
export const isLockedFactPart = (key: string) => {
  const trimmed = key.trim();
  return trimmed === headerPart || trimmed.startsWith("facts:");
};

/** The About's paragraphs as lines, each with an id of its own. */
const aboutLines = (about: Line): Line[] =>
  aboutParagraphs(about.text).map((text, index) => ({
    ...about,
    id: `${about.id}-${index + 1}`,
    text,
  }));

/**
 * A LinkedIn text's parts: the headline and the About, never emptied,
 * each position's and project's bullets and each education's description.
 * Its facts and credentials are printed by code: no part holds them.
 */
function linkedinParts(content: LinkedinContent): DocumentPart[] {
  return [
    {
      key: headlinePart,
      title: "the headline",
      fixed: false,
      lines: content.headline ? [content.headline] : [],
    },
    {
      key: aboutPart,
      title: "the About section",
      fixed: false,
      lines: aboutLines(content.about),
    },
    ...content.experiences.map((entry) => ({
      key: `experience:${entry.positionId}`,
      title: `${entry.employer} — ${entry.title}`,
      fixed: false,
      lines: entry.lines,
    })),
    ...content.projects.map((entry) => ({
      key: `projects:${entry.projectId}`,
      title: entry.name,
      fixed: false,
      lines: entry.lines,
    })),
    ...content.education.map((entry) => ({
      key: educationPart(entry.credentialId),
      title: `the description of ${entry.title}`,
      fixed: false,
      lines: entry.description ? [entry.description] : [],
    })),
  ];
}

export function listDocumentParts(content: ChangeableContent): DocumentPart[] {
  if (content.kind === "linkedin") return linkedinParts(content);
  const header: DocumentPart = {
    key: headerPart,
    title: "the header",
    fixed: true,
    lines: headerLines(content.header),
  };
  if (content.kind === "cover_letter") {
    return [
      header,
      {
        key: greetingPart,
        title: "the greeting",
        fixed: true,
        lines: [{ id: greetingPart, text: content.greeting, origin: printed }],
      },
      {
        key: letterPart,
        title: "the letter's paragraphs",
        fixed: false,
        lines: content.paragraphs,
      },
      {
        key: closingPart,
        title: "the closing",
        fixed: true,
        lines: [{ id: closingPart, text: content.closing, origin: printed }],
      },
    ];
  }
  const parts: DocumentPart[] = [header];
  for (const section of content.sections) {
    switch (section.kind) {
      case "summary":
        parts.push({
          key: summaryPart,
          title: "summary",
          fixed: false,
          lines: [section.line],
        });
        break;
      case "skills":
        parts.push({
          key: skillsPart,
          title: "skills",
          fixed: false,
          lines: section.groups.map((group) => ({
            ...group,
            text: skillLine(group),
          })),
        });
        break;
      case "experience":
        for (const entry of section.entries) {
          parts.push(
            {
              key: factsPart(entry.positionId),
              title: `the facts of ${entry.employer} — ${entry.title}`,
              fixed: true,
              lines: factsLines(entry),
            },
            {
              key: `experience:${entry.positionId}`,
              title: `${entry.employer} — ${entry.title}`,
              fixed: false,
              lines: entry.lines,
            }
          );
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

/** Whether a change still applies to the content as it is now. */
export function changeApplies(
  content: ChangeableContent,
  change: DocumentChange
) {
  const move = sectionMoveOf(change);
  if (move) {
    return (
      content.kind === "resume" && applySectionMove(content, move) !== null
    );
  }
  return locateDocumentChange(content, change) !== null;
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

/** The contacts line split back into its contacts. */
export const splitContacts = (text: string) =>
  text
    .split(/\s*\|\s*/)
    .map((contact) => contact.trim())
    .filter(Boolean);

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

/** A skills line split into its label and items, or null without both. */
const splitSkillLine = (line: string) => {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const label = line.slice(0, colon).trim();
  const text = line.slice(colon + 1).trim();
  return label && text ? { label, text } : null;
};

type SkillPlan = Array<{
  /** The index among the replaced groups it keeps, or null for a new one. */
  kept: number | null;
  label: string;
  text: string;
}>;

/**
 * How written skills lines map onto the groups they replace: a line that
 * keeps the next replaced group's label is that group; any other is a new
 * group (`Label: items`). "locked" when a replaced label is dropped,
 * "malformed" when a new line isn't `Label: items`.
 */
function planSkills(
  labels: string[],
  written: string[]
): SkillPlan | "locked" | "malformed" {
  const plan: SkillPlan = [];
  let next = 0;
  for (const line of written) {
    const label = labels[next];
    if (
      label !== undefined &&
      line.toLowerCase().startsWith(`${label.toLowerCase()}:`)
    ) {
      plan.push({
        kept: next,
        label,
        text: line.slice(label.length + 1).trim(),
      });
      next++;
      continue;
    }
    const added = splitSkillLine(line);
    if (!added) return "malformed";
    plan.push({ kept: null, ...added });
  }
  return next < labels.length ? "locked" : plan;
}

/** The part's lines with the change written, keeping replaced lines' ids. */
function rewriteLines(
  lines: Line[],
  range: { start: number; end: number },
  written: string[],
  origin: LineOrigin
): Line[] {
  const replaced = lines.slice(range.start, range.end);
  const next = written.map((text, index): Line => ({
    id: replaced[index]?.id ?? newChangeLineId(),
    text,
    origin,
  }));
  return [...lines.slice(0, range.start), ...next, ...lines.slice(range.end)];
}

/** The fixed lines of a part with the change written, by line id. */
function writtenById(
  part: DocumentPart,
  range: { start: number; end: number },
  written: string[]
) {
  return new Map(
    part.lines
      .slice(range.start, range.end)
      .map((line, index) => [line.id, written[index]] as const)
  );
}

/**
 * The content with the change applied, or null when it is stale, touches
 * a locked fact or changes the line count of a fixed part. Replaced lines
 * keep their ids (the findings and notes on them still point at them).
 */
export function applyDocumentChange<T extends ChangeableContent>(
  content: T,
  change: DocumentChange,
  evidenceIds: string[] = []
): T | null {
  return applyChange(content, change, evidenceIds) as T | null;
}

function applyChange(
  content: ChangeableContent,
  change: DocumentChange,
  evidenceIds: string[]
): ChangeableContent | null {
  const move = sectionMoveOf(change);
  if (move) {
    return content.kind === "resume" ? applySectionMove(content, move) : null;
  }
  const located = locateDocumentChange(content, change);
  if (!located) return null;
  const { part, start, end } = located;
  const written = splitChangeLines(change.replace);
  if (part.fixed && written.length !== end - start) return null;
  if (
    neverEmptied(part.key) &&
    written.length === 0 &&
    end - start === part.lines.length
  )
    return null;
  const origin = changedLineOrigin(content.kind, evidenceIds, part.key);
  if (content.kind === "linkedin") {
    return applyLinkedinChange(content, located, written, origin);
  }
  if (part.key === headerPart) {
    const lines = writtenById(part, located, written);
    const contacts = lines.get(headerLineIds.contacts);
    return {
      ...content,
      header: {
        ...content.header,
        name: lines.get(headerLineIds.name) ?? content.header.name,
        titleLine:
          lines.get(headerLineIds.titleLine) ?? content.header.titleLine,
        contacts:
          contacts === undefined
            ? content.header.contacts
            : splitContacts(contacts),
        city: lines.get(headerLineIds.city) ?? content.header.city,
      },
    };
  }
  if (content.kind === "cover_letter") {
    if (part.key === greetingPart) {
      return { ...content, greeting: written[0] };
    }
    if (part.key === closingPart) {
      return { ...content, closing: written[0] };
    }
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
                line: {
                  ...section.line,
                  // One paragraph: an addition appends to it.
                  text: (end > start
                    ? written
                    : [section.line.text, ...written]
                  ).join(" "),
                  origin,
                },
              }
            : section;
        case "skills":
          if (part.key !== skillsPart) return section;
          {
            const plan = planSkills(
              section.groups.slice(start, end).map((group) => group.label),
              written
            );
            if (typeof plan === "string") return section;
            return {
              ...section,
              groups: [
                ...section.groups.slice(0, start),
                ...plan.map((item): SkillGroup => {
                  const group =
                    item.kept === null
                      ? null
                      : section.groups[start + item.kept];
                  if (group?.text === item.text) return group;
                  return {
                    id: group?.id ?? newChangeLineId(),
                    label: item.label,
                    text: item.text,
                    origin,
                  };
                }),
                ...section.groups.slice(end),
              ],
            };
          }
        case "experience":
          return {
            ...section,
            entries: section.entries.map((entry) => {
              if (part.key === factsPart(entry.positionId)) {
                const lines = writtenById(part, located, written);
                return {
                  ...entry,
                  employer:
                    lines.get(`employer:${entry.positionId}`) ?? entry.employer,
                  title: lines.get(`title:${entry.positionId}`) ?? entry.title,
                  context:
                    lines.get(`context:${entry.positionId}`) ?? entry.context,
                };
              }
              return part.key === `experience:${entry.positionId}`
                ? {
                    ...entry,
                    lines: rewriteLines(entry.lines, located, written, origin),
                  }
                : entry;
            }),
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

/** The parts a change may rewrite but never leave empty. */
const neverEmptied = (key: string) =>
  key === summaryPart || key === headlinePart || key === aboutPart;

/**
 * A change on a LinkedIn text: the headline and an education's
 * description stay one line (an addition joins it), the About keeps a
 * paragraph per line, bullets are rewritten like a resume's.
 */
function applyLinkedinChange(
  content: LinkedinContent,
  located: { part: DocumentPart; start: number; end: number },
  written: string[],
  origin: LineOrigin
): LinkedinContent {
  const { part } = located;
  const oneLine = (line: Line | null): Line | null => {
    const text = rewriteLines(line ? [line] : [], located, written, origin)
      .map((row) => row.text)
      .join(" ")
      .trim();
    return text ? { id: line?.id ?? newChangeLineId(), text, origin } : null;
  };
  if (part.key === headlinePart) {
    return { ...content, headline: oneLine(content.headline) };
  }
  if (part.key === aboutPart) {
    const paragraphs = rewriteLines(part.lines, located, written, origin);
    return {
      ...content,
      about: {
        ...content.about,
        text: paragraphs.map((row) => row.text).join("\n\n"),
        origin,
      },
    };
  }
  return {
    ...content,
    experiences: content.experiences.map((entry) =>
      part.key === `experience:${entry.positionId}`
        ? {
            ...entry,
            lines: rewriteLines(entry.lines, located, written, origin),
          }
        : entry
    ),
    projects: content.projects.map((entry) =>
      part.key === `projects:${entry.projectId}`
        ? {
            ...entry,
            lines: rewriteLines(entry.lines, located, written, origin),
          }
        : entry
    ),
    education: content.education.map((entry) =>
      part.key === educationPart(entry.credentialId)
        ? { ...entry, description: oneLine(entry.description) }
        : entry
    ),
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
  if (
    neverEmptied(part.key) &&
    !written.length &&
    end - start === part.lines.length
  )
    return "fixedLines";
  if (part.key === skillsPart) {
    const plan = planSkills(
      part.lines.slice(start, end).map((line) => line.text.split(":")[0]),
      written
    );
    if (plan === "locked") return "locked";
    if (plan === "malformed") return "fixedLines";
  }
  return null;
}
