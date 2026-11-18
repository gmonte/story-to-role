import {
  credentialLine,
  formatPeriod,
  positionTitleLine,
  sectionTitles,
} from "@repo/api/domains/documents/rendering/output-conventions";
import type { CoverLetterContent } from "@repo/api/domains/documents/schemas/cover-letter-content";
import type {
  Line,
  OutputLanguage,
} from "@repo/api/domains/documents/schemas/document";
import type {
  ResumeContent,
  ResumeSection,
  ResumeSectionKind,
} from "@repo/api/domains/documents/schemas/resume-content";

/** The content the document editor shows: a resume or a cover letter. */
export type EditableContent = ResumeContent | CoverLetterContent;

/**
 * The document as the editor holds it (resume spec, "Document workspace"):
 * flat blocks in reading order, each either a line the user writes (with
 * the id of the line it edits) or a fact code prints, which is locked.
 */
export type DocumentBlock =
  | { type: "name"; text: string }
  | { type: "titleLine"; text: string }
  | { type: "contacts"; text: string }
  | { type: "sectionTitle"; kind: ResumeSectionKind; text: string }
  | { type: "summary"; lineId: string; text: string }
  | { type: "skill"; lineId: string; label: string; text: string }
  | {
      type: "entry";
      // The position or project the bullets below belong to.
      ownerId: string;
      title: string;
      subtitle: string | null;
      period: string | null;
      // A very old experience: the requirement it entered for.
      note: string | null;
    }
  | { type: "bullet"; lineId: string; ownerId: string; text: string }
  | { type: "credential"; credentialId: string; text: string }
  | { type: "greeting"; text: string }
  | { type: "paragraph"; lineId: string; text: string }
  | { type: "closing"; text: string };

export type EditableBlock = Extract<
  DocumentBlock,
  {
    type: "summary" | "skill" | "bullet" | "greeting" | "paragraph" | "closing";
  }
>;

const editableTypes = new Set<DocumentBlock["type"]>([
  "summary",
  "skill",
  "bullet",
  "greeting",
  "paragraph",
  "closing",
]);

/** Whether the user may type in a block; the rest edit through the profile. */
export function isEditableBlock(block: DocumentBlock): block is EditableBlock {
  return editableTypes.has(block.type);
}

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
    {
      type: "contacts",
      text: [...header.contacts, header.city].filter(Boolean).join(" | "),
    },
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
      return section.entries.flatMap((entry): DocumentBlock[] => [
        {
          type: "entry",
          ownerId: entry.positionId,
          title: entry.employer,
          subtitle: positionTitleLine(entry),
          period: formatPeriod(entry.startDate, entry.endDate, language),
          note: entry.relevance ?? null,
        },
        ...entry.lines.map(
          (line): DocumentBlock => ({
            type: "bullet",
            lineId: line.id,
            ownerId: entry.positionId,
            text: line.text,
          })
        ),
      ]);
    case "projects":
      return section.entries.flatMap((entry): DocumentBlock[] => [
        {
          type: "entry",
          ownerId: entry.projectId,
          title: entry.name,
          subtitle: null,
          period: null,
          note: null,
        },
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

/** The lines a list of edited blocks writes: kept by id, or the user's own. */
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

/**
 * The content the blocks describe, written over `base`: the lines the user
 * can edit take their text, order and presence from the blocks (a new
 * bullet is a new line, a missing one is removed); everything locked (the
 * header, the section titles, each position's facts, the credentials)
 * comes from `base`, whatever the blocks say. The server marks the lines
 * that changed as written by the user.
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
  const next: ResumeContent = {
    ...base,
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
            entries: section.entries.map((entry) => ({
              ...entry,
              lines: bulletsOf(entry.positionId, entry.lines),
            })),
          };
        case "projects":
          return {
            ...section,
            entries: section.entries.map((entry) => ({
              ...entry,
              lines: bulletsOf(entry.projectId, entry.lines),
            })),
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
