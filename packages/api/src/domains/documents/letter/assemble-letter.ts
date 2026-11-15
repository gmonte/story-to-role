import { randomUUID } from "node:crypto";

import { z } from "zod";

import { LockedFactEditError } from "../editing/apply-user-edit";
import type { Line } from "../schemas/document";
import type { CoverLetterContent } from "../schemas/cover-letter-content";
import type { ResumeHeader } from "../schemas/resume-content";

const sourceIds = {
  evidence_ids: z.array(z.string()),
  company_fact_ids: z.array(z.string()),
  motivation_point_ids: z.array(z.string()),
  career_goal_ids: z.array(z.string()),
};

/** What the writing model returns: the letter's words and their sources. */
export const letterDraftSchema = z.object({
  greeting: z.string(),
  paragraphs: z.array(z.object({ text: z.string(), ...sourceIds })),
  closing: z.string(),
});
export type LetterDraft = z.infer<typeof letterDraftSchema>;

type Source = { id: string; text: string };

/** Everything a letter may rest on, each approved by the user. */
export type LetterSources = {
  evidence: Source[];
  companyFacts: Source[];
  motivationPoints: Source[];
  careerGoals: Source[];
};

export type RefusedParagraph = {
  text: string;
  reason: "no_source" | "unsupported_figure" | "forbidden_term";
};

/** Every figure in a paragraph must appear in what it cites. */
function figuresBackedBy(text: string, sources: string[]) {
  const all = sources.join(" ");
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).every((figure) =>
    all.includes(figure)
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
  newLineId?: () => string;
}): { content: CoverLetterContent; refused: RefusedParagraph[] } {
  const { draft, sources } = input;
  const newLineId = input.newLineId ?? (() => randomUUID().slice(0, 8));
  const known = (list: Source[], ids: string[]) =>
    [...new Set(ids)].filter((id) => list.some((source) => source.id === id));
  const textOf = (list: Source[], ids: string[]) =>
    ids.map((id) => list.find((source) => source.id === id)!.text);
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
      careerGoalIds: known(sources.careerGoals, paragraph.career_goal_ids),
    };
    const cited = [
      ...textOf(sources.evidence, origin.evidenceIds),
      ...textOf(sources.companyFacts, origin.companyFactIds),
      ...textOf(sources.motivationPoints, origin.motivationPointIds),
      ...textOf(sources.careerGoals, origin.careerGoalIds),
    ];
    if (cited.length === 0) {
      refused.push({ text, reason: "no_source" });
      return [];
    }
    if (!figuresBackedBy(text, cited)) {
      refused.push({ text, reason: "unsupported_figure" });
      return [];
    }
    return [{ id: newLineId(), text, origin }];
  });

  return {
    content: {
      kind: "cover_letter",
      header: input.header,
      greeting: draft.greeting.trim(),
      paragraphs,
      closing: signed(draft.closing.trim(), input.header.name),
    },
    refused,
  };
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
 * The user's edit of a letter: changed or new paragraphs are the user's
 * own words from now on; the header comes from the template and stays.
 */
export function applyLetterEdit(
  previous: CoverLetterContent,
  next: CoverLetterContent
): CoverLetterContent {
  if (JSON.stringify(previous.header) !== JSON.stringify(next.header)) {
    throw new LockedFactEditError();
  }
  const before = new Map(previous.paragraphs.map((line) => [line.id, line]));
  return {
    ...next,
    paragraphs: next.paragraphs.map((line) => {
      const old = before.get(line.id);
      return old?.text === line.text
        ? old
        : { ...line, origin: { kind: "manual" as const } };
    }),
  };
}
