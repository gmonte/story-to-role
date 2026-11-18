import { randomUUID } from "node:crypto";

import { z } from "zod";

import { findMarks } from "@repo/api/domains/profile/truth/marks";
import { ungivenFigures } from "@repo/api/domains/profile/truth/suggestions";

import { withheld } from "../generation/profile-source";
import { markEditedLine } from "../editing/edited-origin";
import type { Line, OutputLanguage } from "../schemas/document";
import type { CoverLetterContent } from "../schemas/cover-letter-content";
import type { ResumeHeader } from "../schemas/resume-content";

const sourceIds = {
  evidence_ids: z.array(z.string()),
  company_fact_ids: z.array(z.string()),
  motivation_point_ids: z.array(z.string()),
  instruction_ids: z.array(z.string()).catch([]),
};

/** What the writing model returns: the letter's words and their sources. */
export const letterDraftSchema = z.object({
  greeting: z.string(),
  paragraphs: z.array(z.object({ text: z.string(), ...sourceIds })),
  closing: z.string(),
});
export type LetterDraft = z.infer<typeof letterDraftSchema>;

type Source = {
  id: string;
  text: string;
  // The text whose numbers a paragraph resting on this may carry (a profile
  // line's measured figures only); the text itself when it has none.
  figures?: string;
};

/**
 * Everything a letter may rest on: lines of the frozen profile, the
 * application's instructions and the motivation points (the user's own
 * words) and the company facts the user approved.
 */
export type LetterSources = {
  evidence: Source[];
  companyFacts: Source[];
  motivationPoints: Source[];
  instructions: Source[];
};

export type RefusedParagraph = {
  text: string;
  reason: "no_source" | "unsupported_figure" | "forbidden_term";
};

/**
 * Figures follow the resume's rules (resume spec, "Generation rules"): a
 * paragraph carries only numbers its sources show as measured (or the user
 * wrote), a position's years, and no mark or placeholder.
 */
function figuresBackedBy(text: string, sources: string[]) {
  return (
    !text.includes(withheld) &&
    findMarks(text).length === 0 &&
    ungivenFigures(text, sources).length === 0
  );
}

/**
 * Turns a draft into a letter (resume spec: "The story comes only from
 * approved evidence and the user's own words, and company facts only from
 * approved research, so the letter invents nothing"). Each paragraph must
 * cite sources it was given, and every figure in it must appear in them;
 * refused paragraphs are left out and reported. The header is the
 * template's.
 */
export function assembleLetter(input: {
  draft: LetterDraft;
  sources: LetterSources;
  header: ResumeHeader;
  language: OutputLanguage;
  /** Years a letter may name: the positions' dates, locked facts. */
  years?: string[];
  /** Names and figures the user doesn't allow (the sensitive filter). */
  isForbidden?: (
    text: string,
    cited: { evidenceIds: string[]; instructionIds: string[] }
  ) => boolean;
  newLineId?: () => string;
}): { content: CoverLetterContent; refused: RefusedParagraph[] } {
  const { draft, sources } = input;
  const newLineId = input.newLineId ?? (() => randomUUID().slice(0, 8));
  const known = (list: Source[], ids: string[]) =>
    [...new Set(ids)].filter((id) => list.some((source) => source.id === id));
  const textOf = (list: Source[], ids: string[], figures = false) =>
    ids.map((id) => {
      const source = list.find((candidate) => candidate.id === id)!;
      return figures ? (source.figures ?? source.text) : source.text;
    });
  const refused: RefusedParagraph[] = [];

  const paragraphs = draft.paragraphs.flatMap((paragraph): Line[] => {
    const text = paragraph.text.trim();
    if (!text) return [];
    const origin = {
      kind: "letter" as const,
      evidenceIds: known(sources.evidence, paragraph.evidence_ids),
      companyFactIds: known(sources.companyFacts, paragraph.company_fact_ids),
      motivationPointIds: known(
        sources.motivationPoints,
        paragraph.motivation_point_ids
      ),
      instructionIds: known(sources.instructions, paragraph.instruction_ids),
    };
    const cited = [
      ...textOf(sources.evidence, origin.evidenceIds, true),
      ...textOf(sources.companyFacts, origin.companyFactIds),
      ...textOf(sources.motivationPoints, origin.motivationPointIds),
      ...textOf(sources.instructions, origin.instructionIds),
    ];
    if (cited.length === 0) {
      refused.push({ text, reason: "no_source" });
      return [];
    }
    if (!figuresBackedBy(text, [...cited, ...(input.years ?? [])])) {
      refused.push({ text, reason: "unsupported_figure" });
      return [];
    }
    if (input.isForbidden?.(text, origin)) {
      refused.push({ text, reason: "forbidden_term" });
      return [];
    }
    return [{ id: newLineId(), text, origin }];
  });

  return {
    content: {
      kind: "cover_letter",
      header: input.header,
      greeting: plain(
        draft.greeting,
        conventions[input.language].greeting,
        input.isForbidden &&
          ((text) =>
            input.isForbidden!(text, { evidenceIds: [], instructionIds: [] }))
      ),
      paragraphs,
      closing: signed(
        plain(
          draft.closing,
          conventions[input.language].closing,
          input.isForbidden &&
            ((text) =>
              input.isForbidden!(text, { evidenceIds: [], instructionIds: [] }))
        ),
        input.header.name
      ),
    },
    refused,
  };
}

/** A greeting or close in the letter's language, when the model's won't do. */
const conventions: Record<
  OutputLanguage,
  { greeting: string; closing: string }
> = {
  "en-US": { greeting: "Dear Hiring Team,", closing: "Sincerely," },
  "pt-BR": { greeting: "Prezada equipe,", closing: "Atenciosamente," },
};

/**
 * A greeting or close holds no fact: one with a figure or a name the user
 * doesn't allow is replaced by the language's plain one.
 */
function plain(
  text: string,
  fallback: string,
  isForbidden?: (text: string) => boolean
) {
  // Template placeholders ("[Your Name]") never reach the letter.
  const trimmed = text
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return !trimmed || /\d/.test(trimmed) || isForbidden?.(trimmed)
    ? fallback
    : trimmed;
}

/** A formal close ends with the user's name, as printed in the header. */
function signed(closing: string, name: string) {
  const trimmed = name.trim();
  return !trimmed || closing.includes(trimmed)
    ? closing
    : `${closing}\n${trimmed}`;
}

/** The letter as plain text, for vectors and copying. */
export function letterText(content: CoverLetterContent) {
  return [
    content.greeting,
    ...content.paragraphs.map((line) => line.text),
    content.closing,
  ].join("\n\n");
}

/** Lines of 10pt Helvetica on an A4 page in the letter's layout. */
const LINES_PER_PAGE = 50;
const CHARACTERS_PER_LINE = 95;

/** An estimate of the rendered length, aiming at one page. */
export function estimateLetterPages(content: CoverLetterContent) {
  const wrapped = (text: string) =>
    text
      .split("\n")
      .reduce(
        (lines, part) =>
          lines + Math.max(1, Math.ceil(part.length / CHARACTERS_PER_LINE)),
        0
      );
  // Header block, greeting and the space between paragraphs.
  let lines = 6 + wrapped(content.greeting) + 1;
  for (const paragraph of content.paragraphs) {
    lines += wrapped(paragraph.text) + 1;
  }
  lines += wrapped(content.closing);
  return Math.round((lines / LINES_PER_PAGE) * 10) / 10;
}

/**
 * The user's edit of a letter: a new paragraph is the user's own words; a
 * reworded one keeps its sources as "edited"; the header, the greeting
 * and the closing are theirs to change.
 */
export function applyLetterEdit(
  previous: CoverLetterContent,
  next: CoverLetterContent
): CoverLetterContent {
  const before = new Map(previous.paragraphs.map((line) => [line.id, line]));
  return {
    ...next,
    paragraphs: next.paragraphs.map((line) =>
      markEditedLine(line, before.get(line.id))
    ),
  };
}
