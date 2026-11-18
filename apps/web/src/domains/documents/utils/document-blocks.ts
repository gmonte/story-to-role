import {
  contactsSeparator,
  splitContacts,
} from "@repo/api/domains/documents/changes/document-change";
import {
  credentialLine,
  formatPeriod,
  parsePeriod,
  sectionTitles,
} from "@repo/api/domains/documents/rendering/output-conventions";
import type { CoverLetterContent } from "@repo/api/domains/documents/schemas/cover-letter-content";
import type {
  Line,
  OutputLanguage,
} from "@repo/api/domains/documents/schemas/document";
import type {
  ExperienceEntry,
  ResumeContent,
  ResumeSection,
  ResumeSectionKind,
} from "@repo/api/domains/documents/schemas/resume-content";

/** The content the document editor shows: a resume or a cover letter. */
export type EditableContent = ResumeContent | CoverLetterContent;

/**
 * The document as the editor holds it (resume spec, "Document workspace"):
 * flat blocks in reading order. The document is the user's: every block
 * is text they may edit, except the section titles (the template's), the
 * credentials (the profile's records) and a very old experience's note.
 * A line the user writes carries the id of the line it edits; a
 * position's facts carry the position as their owner.
 */
export type DocumentBlock =
  | { type: "name"; text: string }
  | { type: "titleLine"; text: string }
  | { type: "contacts"; text: string }
  | { type: "city"; text: string }
  | { type: "sectionTitle"; kind: ResumeSectionKind; text: string }
  | { type: "summary"; lineId: string; text: string }
  | { type: "skill"; lineId: string; label: string; text: string }
  // The employer of a position, or a project's name.
  | { type: "entry"; ownerId: string; text: string }
  // A position's period, as the PDF prints it ("Mar/2021 – Present").
  | { type: "entryPeriod"; ownerId: string; text: string }
  | { type: "entryTitle"; ownerId: string; text: string }
  | { type: "entryContext"; ownerId: string; text: string }
  // A project's link, as the PDF prints it under the name.
  | { type: "entryLink"; ownerId: string; text: string }
  // A very old experience: the requirement it entered for.
  | { type: "entryNote"; ownerId: string; text: string }
  | { type: "bullet"; lineId: string; ownerId: string; text: string }
  | { type: "credential"; credentialId: string; text: string }
  | { type: "greeting"; text: string }
  | { type: "paragraph"; lineId: string; text: string }
  | { type: "closing"; text: string };

const lockedTypes = new Set<DocumentBlock["type"]>([
  "sectionTitle",
  "credential",
  "entryNote",
]);

/** Whether the user may type in a block. */
export const isEditableBlock = (block: DocumentBlock) =>
  !lockedTypes.has(block.type);

/** Whether a block splits into another of its kind on Enter. */
export const isListBlock = (type: DocumentBlock["type"]) =>
  type === "bullet" || type === "paragraph";

/** The line id a block edits, when it edits one. */
export function lineIdOf(block: DocumentBlock) {
  return "lineId" in block ? block.lineId : null;
}

function headerBlocks(content: EditableContent): DocumentBlock[] {
  const { header } = content;
  return [
    { type: "name", text: header.name },
    { type: "titleLine", text: header.titleLine },
    { type: "contacts", text: header.contacts.join(contactsSeparator) },
    ...(header.city === null
      ? []
      : [{ type: "city", text: header.city } satisfies DocumentBlock]),
  ];
}

function experienceBlocks(
  entry: ExperienceEntry,
  language: OutputLanguage
): DocumentBlock[] {
  const ownerId = entry.positionId;
  return [
    {
      type: "entryPeriod",
      ownerId,
      text: formatPeriod(entry.startDate, entry.endDate, language),
    },
    { type: "entry", ownerId, text: entry.employer },
    { type: "entryTitle", ownerId, text: entry.title },
    ...(entry.context === null
      ? []
      : [{ type: "entryContext", ownerId, text: entry.context } as const]),
    ...(entry.relevance
      ? [{ type: "entryNote", ownerId, text: entry.relevance } as const]
      : []),
    ...entry.lines.map(
      (line): DocumentBlock => ({
        type: "bullet",
        lineId: line.id,
        ownerId,
        text: line.text,
      })
    ),
  ];
}

function sectionBlocks(
  section: ResumeSection,
  language: OutputLanguage
): DocumentBlock[] {
  switch (section.kind) {
    case "summary":
      return [
        { type: "summary", lineId: section.line.id, text: section.line.text },
      ];
    case "skills":
      return section.groups.map((group) => ({
        type: "skill",
        lineId: group.id,
        label: group.label,
        text: group.text,
      }));
    case "experience":
      return section.entries.flatMap((entry) =>
        experienceBlocks(entry, language)
      );
    case "projects":
      return section.entries.flatMap((entry): DocumentBlock[] => [
        ...(entry.startDate || entry.endDate
          ? [
              {
                type: "entryPeriod",
                ownerId: entry.projectId,
                text: formatPeriod(entry.startDate, entry.endDate, language),
              } as const,
            ]
          : []),
        { type: "entry", ownerId: entry.projectId, text: entry.name },
        // The role sits where a position's title does.
        ...(entry.role === null
          ? []
          : [
              {
                type: "entryTitle",
                ownerId: entry.projectId,
                text: entry.role,
              } as const,
            ]),
        ...(entry.link === null
          ? []
          : [
              {
                type: "entryLink",
                ownerId: entry.projectId,
                text: entry.link,
              } as const,
            ]),
        ...entry.lines.map(
          (line): DocumentBlock => ({
            type: "bullet",
            lineId: line.id,
            ownerId: entry.projectId,
            text: line.text,
          })
        ),
      ]);
    default:
      return section.entries.map((entry) => ({
        type: "credential",
        credentialId: entry.credentialId,
        text: credentialLine(entry, language),
      }));
  }
}

/** The document's blocks, in the order the PDF prints them. */
export function contentToBlocks(
  content: EditableContent,
  language: OutputLanguage
): DocumentBlock[] {
  if (content.kind === "cover_letter") {
    return [
      ...headerBlocks(content),
      { type: "greeting", text: content.greeting },
      ...content.paragraphs.map(
        (line): DocumentBlock => ({
          type: "paragraph",
          lineId: line.id,
          text: line.text,
        })
      ),
      { type: "closing", text: content.closing },
    ];
  }
  return [
    ...headerBlocks(content),
    ...content.sections.flatMap((section): DocumentBlock[] => [
      {
        type: "sectionTitle",
        kind: section.kind,
        text: sectionTitles[language][section.kind],
      },
      ...sectionBlocks(section, language),
    ]),
  ];
}

/**
 * The lines a list of edited blocks writes: kept by id with the origin
 * they had (the server marks a reworded one as edited), or the user's
 * own when new.
 */
function linesFrom(
  blocks: Array<{ lineId: string; text: string }>,
  before: Line[]
): Line[] {
  const byId = new Map(before.map((line) => [line.id, line]));
  return blocks.map((block) => {
    const old = byId.get(block.lineId);
    return old
      ? { ...old, text: block.text }
      : { id: block.lineId, text: block.text, origin: { kind: "manual" } };
  });
}

function headerFrom<T extends EditableContent>(
  base: T,
  blocks: DocumentBlock[]
): T["header"] {
  const text = (type: DocumentBlock["type"]) => {
    const block = blocks.find((row) => row.type === type);
    return block && "text" in block ? block.text : undefined;
  };
  const contacts = text("contacts");
  const city = text("city");
  return {
    ...base.header,
    name: text("name") ?? base.header.name,
    titleLine: text("titleLine") ?? base.header.titleLine,
    contacts:
      contacts === undefined ? base.header.contacts : splitContacts(contacts),
    city:
      base.header.city === null
        ? null
        : city === undefined
          ? base.header.city
          : city.trim() || null,
  };
}

/**
 * The content the blocks describe, written over `base`: the lines the user
 * can edit take their text, order and presence from the blocks (a new
 * bullet is a new line, a missing one is removed); the header and each
 * position's facts take their text too (a period that doesn't read as
 * one keeps its dates); the section titles and the credentials come from
 * `base`, whatever the blocks say. The server marks the lines that
 * changed as edited or written by the user.
 */
export function blocksToContent<T extends EditableContent>(
  base: T,
  blocks: DocumentBlock[]
): T {
  if (base.kind === "cover_letter") {
    const greeting = blocks.find((block) => block.type === "greeting");
    const closing = blocks.find((block) => block.type === "closing");
    const paragraphs = blocks.filter((block) => block.type === "paragraph");
    const next: CoverLetterContent = {
      ...base,
      header: headerFrom(base, blocks),
      greeting: greeting?.text ?? base.greeting,
      paragraphs: linesFrom(paragraphs, base.paragraphs),
      closing: closing?.text ?? base.closing,
    };
    return next as T;
  }
  const summary = blocks.find((block) => block.type === "summary");
  const skills = new Map(
    blocks.flatMap((block) =>
      block.type === "skill" ? [[block.lineId, block.text] as const] : []
    )
  );
  const bullets = blocks.filter((block) => block.type === "bullet");
  const bulletsOf = (ownerId: string, before: Line[]) =>
    linesFrom(
      bullets.filter((block) => block.ownerId === ownerId),
      before
    );
  const factOf = (ownerId: string, type: DocumentBlock["type"]) => {
    const block = blocks.find(
      (row) => row.type === type && "ownerId" in row && row.ownerId === ownerId
    );
    return block && "text" in block ? block.text : undefined;
  };
  const next: ResumeContent = {
    ...base,
    header: headerFrom(base, blocks),
    sections: base.sections.map((section): ResumeSection => {
      switch (section.kind) {
        case "summary":
          return summary
            ? { ...section, line: { ...section.line, text: summary.text } }
            : section;
        case "skills":
          return {
            ...section,
            groups: section.groups.map((group) => ({
              ...group,
              text: skills.get(group.id) ?? group.text,
            })),
          };
        case "experience":
          return {
            ...section,
            entries: section.entries.map((entry) => {
              const id = entry.positionId;
              const period = factOf(id, "entryPeriod");
              const dates = period === undefined ? null : parsePeriod(period);
              const context = factOf(id, "entryContext");
              return {
                ...entry,
                employer: factOf(id, "entry") ?? entry.employer,
                title: factOf(id, "entryTitle") ?? entry.title,
                startDate: dates ? dates.startDate : entry.startDate,
                endDate: dates ? dates.endDate : entry.endDate,
                context:
                  entry.context === null
                    ? null
                    : context === undefined
                      ? entry.context
                      : context.trim() || null,
                lines: bulletsOf(id, entry.lines),
              };
            }),
          };
        case "projects":
          return {
            ...section,
            entries: section.entries.map((entry) => {
              const id = entry.projectId;
              const period = factOf(id, "entryPeriod");
              const dates = period === undefined ? null : parsePeriod(period);
              const link = factOf(id, "entryLink");
              const role = factOf(id, "entryTitle");
              return {
                ...entry,
                name: factOf(id, "entry") ?? entry.name,
                role:
                  entry.role === null
                    ? null
                    : role === undefined
                      ? entry.role
                      : role.trim() || null,
                startDate: dates ? dates.startDate : entry.startDate,
                endDate: dates ? dates.endDate : entry.endDate,
                link:
                  entry.link === null
                    ? null
                    : link === undefined
                      ? entry.link
                      : link.trim() || null,
                lines: bulletsOf(id, entry.lines),
              };
            }),
          };
        default:
          return section;
      }
    }),
  };
  return next as T;
}

/** Every line of the content by id, for the trace and the findings. */
export function linesById(content: EditableContent) {
  const lines =
    content.kind === "cover_letter"
      ? content.paragraphs
      : content.sections.flatMap((section): Line[] => {
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
  return new Map(lines.map((line) => [line.id, line]));
}

/** A fresh line id for a bullet or paragraph the user adds. */
export const newLineId = () => crypto.randomUUID().slice(0, 8);
