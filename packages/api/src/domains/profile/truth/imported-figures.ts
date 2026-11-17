import { blockToLine, type ProfileBlock } from "./blocks";
import {
  canonicalMarks,
  canonicalMarkText,
  findMarks,
  hasFigure,
} from "./marks";
import { experienceFieldOf, type ProfileLanguage } from "./sections";
import { readStructure, splitLabel } from "./structure";
import { locateChange, parseFragment, type ProfileChange } from "./suggestions";

/** Whether the line a change starts at sits under an experience's results. */
function startsInResults(blocks: ProfileBlock[], line: number) {
  return readStructure(blocks).experiences.some((experience) => {
    const results = experience.fields.results;
    return (
      results && (results.line === line || results.children.includes(line))
    );
  });
}

/** The mark goes before the sentence's final period, as the method writes. */
function withMark(text: string, mark: string) {
  const trimmed = text.trimEnd();
  return trimmed.endsWith(".")
    ? `${trimmed.slice(0, -1)} [${mark}].`
    : `${trimmed} [${mark}]`;
}

/**
 * Figures from an uploaded file arrive as "to confirm" (profile spec,
 * "Importing a resume"): an old resume may carry figures with no backing.
 * In the lines a change writes under an experience's results, a figure with
 * no mark gets the open mark, and a "measured" or "estimated" mark the file
 * itself doesn't carry becomes the open mark; lines the profile already
 * has keep their marks. Code, not the prompt, since generated documents
 * trust the marks.
 */
export function markImportedFigures(
  draft: ProfileBlock[],
  change: ProfileChange,
  fileText: string,
  language: ProfileLanguage
): ProfileChange {
  const range = locateChange(draft, change);
  if (!range || !change.part.startsWith("experience")) return change;
  const open = canonicalMarks[language].toConfirm;
  const fileMarks = new Set(findMarks(fileText).map((match) => match.mark));
  // Replaced or continued lines keep where they are; a labelled line says
  // where the ones under it belong.
  const anchor = range.end > range.start ? range.start : range.start - 1;
  let inResults = startsInResults(draft, anchor);

  // What the profile already says is the person's: its marks stay as they
  // wrote them, even inside a block the change rewrites.
  const existing = new Set(draft.map((block) => block.text.trim()));

  const lines = parseFragment(change.replace).flatMap(
    (block): ProfileBlock[] => {
      if (block.type === "heading") {
        inResults = false;
        return [block];
      }
      if (block.type !== "item") return [block];
      let isResult = inResults;
      if (block.depth === 0) {
        const labelled = splitLabel(block.text);
        const field = labelled ? experienceFieldOf(labelled.label) : null;
        if (field) {
          inResults = field === "results";
          isResult = inResults && !!labelled?.value;
        } else if (!startsInResults(draft, anchor)) {
          inResults = false;
          isResult = false;
        }
      }
      if (!isResult || existing.has(block.text.trim())) return [block];

      let text = block.text;
      // A mark the file doesn't carry is the model's, not the person's.
      for (const match of findMarks(text).reverse()) {
        if (
          (match.mark === "measured" || match.mark === "estimated") &&
          !fileMarks.has(match.mark)
        ) {
          text = `${text.slice(0, match.from)}[${open}]${text.slice(match.to)}`;
        } else {
          text =
            text.slice(0, match.from) +
            canonicalMarkText(match, language) +
            text.slice(match.to);
        }
      }
      if (hasFigure(text) && !findMarks(text).length)
        text = withMark(text, open);
      // A result that is only a mark says nothing.
      const said = findMarks(text).reduceRight(
        (rest, match) => rest.slice(0, match.from) + rest.slice(match.to),
        text
      );
      return /[\p{L}\p{N}]/u.test(said) ? [{ ...block, text }] : [];
    }
  );
  return { ...change, replace: lines.map(blockToLine).join("\n") };
}
