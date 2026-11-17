import { blockToLine, parseBlocks, type ProfileBlock } from "./blocks";
import { experienceKeys } from "./chunks";
import { normalizeLabel } from "./sections";
import { readCanonicalTitle, readStructure } from "./structure";

/**
 * A change proposed to the profile (profile spec, "Suggestions"): the lines
 * it replaces, quoted from one part of the document, and the lines that
 * take their place. Nothing is changed until the user accepts it.
 */
export type ProfileChange = {
  // The part's key, from `listParts`.
  part: string;
  // The Markdown lines to replace; empty adds at the end of the part.
  find: string;
  // The new Markdown lines; empty removes the lines.
  replace: string;
};

/** A section, or one experience inside Experience. */
export type ProfilePart = {
  key: string;
  title: string;
  kind: "section" | "experience";
  // The heading's line and the line after the part's last.
  start: number;
  end: number;
};

export function listParts(blocks: ProfileBlock[]): ProfilePart[] {
  const structure = readStructure(blocks);
  const keys = experienceKeys(structure);
  const parts: ProfilePart[] = [];
  for (const section of structure.sections) {
    const heading = blocks[section.heading];
    parts.push({
      key: section.key ?? `other:${normalizeLabel(heading.text)}`,
      title: heading.text,
      kind: "section",
      start: section.heading,
      end: section.end,
    });
    if (section.key !== "experience") continue;
    structure.experiences.forEach((experience, index) => {
      parts.push({
        key: keys[index],
        title: experience.rawTitle,
        kind: "experience",
        start: experience.heading,
        end: experience.end,
      });
    });
  }
  return parts;
}

function lines(blocks: ProfileBlock[], start: number, end: number) {
  return blocks.slice(start, end).map(blockToLine).join("\n");
}

/**
 * A part's lines, for the agent to read. Experience as a whole is most of
 * the document, so it reads as the list of its positions, each read by its
 * own key.
 */
export function partText(blocks: ProfileBlock[], key: string): string | null {
  const parts = listParts(blocks);
  const part = parts.find((candidate) => candidate.key === key);
  if (!part) return null;
  if (part.key !== "experience") return lines(blocks, part.start, part.end);
  const experiences = parts.filter((p) => p.kind === "experience");
  const intro = lines(blocks, part.start, experiences[0]?.start ?? part.end);
  return [intro, ...experiences.map((p) => `${p.key} | ${p.title}`)].join("\n");
}

/** A change's lines (what it replaces, or what it writes) as blocks. */
export const parseFragment = (markdown: string) =>
  parseBlocks(markdown, { fragment: true });

const sameText = (a: ProfileBlock, b: ProfileBlock) =>
  a.text.trim() === b.text.trim();

/** Where `wanted` appears as consecutive lines within [start, end). */
function matches(
  blocks: ProfileBlock[],
  wanted: ProfileBlock[],
  start: number,
  end: number
) {
  const found: number[] = [];
  for (let at = start; at + wanted.length <= end; at++) {
    if (wanted.every((block, offset) => sameText(blocks[at + offset], block))) {
      found.push(at);
    }
  }
  return found;
}

/** Where a new experience goes: before the first one that started earlier. */
function experiencePosition(
  blocks: ProfileBlock[],
  heading: ProfileBlock,
  fallback: number
) {
  const title = readCanonicalTitle(heading.text);
  if (!title) return fallback;
  const before = readStructure(blocks).experiences.find(
    (experience) =>
      experience.parsed && experience.parsed.range.start < title.range.start
  );
  return before?.heading ?? fallback;
}

/**
 * The lines a change replaces in the document as it is now ({start, end},
 * equal for an addition), or null when it is stale: its lines were edited
 * away or appear more than once, its part is gone and they are nowhere
 * sure, or what it adds is already there.
 * Lines are matched by their text, whatever their list marker or depth.
 */
export function locateChange(
  blocks: ProfileBlock[],
  change: ProfileChange
): { start: number; end: number } | null {
  const part = listParts(blocks).find((p) => p.key === change.part);
  const wanted = parseFragment(change.find);
  if (!wanted.length) {
    if (!part) return null;
    const adding = parseFragment(change.replace);
    // Already there (accepted before, or typed by the user): nothing to add.
    if (matches(blocks, adding, part.start, part.end).length) return null;
    const [first] = adding;
    const at =
      part.key === "experience" &&
      first?.type === "heading" &&
      first.level === 3
        ? experiencePosition(blocks, first, part.end)
        : part.end;
    return { start: at, end: at };
  }
  // Only a single match is safe: in the part, or, when the part was renamed
  // or the lines moved, in the whole document.
  const found = part ? matches(blocks, wanted, part.start, part.end) : [];
  const [at, ...others] = found.length
    ? found
    : matches(blocks, wanted, 0, blocks.length);
  return at === undefined || others.length
    ? null
    : { start: at, end: at + wanted.length };
}

/**
 * The change as the document writes it, or null when it doesn't apply: its
 * lines copied from the document, and its replacement shaped like what it
 * replaces. A model often drops the list marker or the indentation, so a
 * plain line taking a list item's place (or added after one) becomes an
 * item, and replaced items keep the depth of the first line they replace.
 */
export function normalizeChange(
  blocks: ProfileBlock[],
  change: ProfileChange
): ProfileChange | null {
  const range = locateChange(blocks, change);
  if (!range) return null;
  const replacing = range.end > range.start;
  const model = replacing ? blocks[range.start] : blocks[range.start - 1];
  const base = replacing && model?.type === "item" ? model.depth : 0;
  const proposed = parseFragment(change.replace);
  const shallowest = Math.min(
    ...proposed.flatMap((block) => (block.type === "item" ? [block.depth] : []))
  );
  const replacement = proposed.map((block): ProfileBlock => {
    if (block.type === "paragraph" && model?.type === "item") {
      return { type: "item", depth: base, text: block.text };
    }
    if (block.type === "item" && replacing && model?.type === "item") {
      return { ...block, depth: block.depth - shallowest + base };
    }
    return block;
  });
  return {
    part: change.part,
    find: lines(blocks, range.start, range.end),
    replace: replacement.map(blockToLine).join("\n"),
  };
}

/** The document with the change applied, or null when it is stale. */
export function applyChange(
  blocks: ProfileBlock[],
  change: ProfileChange
): ProfileBlock[] | null {
  const range = locateChange(blocks, change);
  if (!range) return null;
  return [
    ...blocks.slice(0, range.start),
    ...parseFragment(change.replace),
    ...blocks.slice(range.end),
  ];
}

/**
 * A change made inside the lines a waiting suggestion writes (its
 * `replace`), for a newer version of that suggestion: the lines to replace
 * must be there exactly once; an empty `find` adds at the end. Null when it
 * doesn't apply or changes nothing.
 */
export function rewriteFragment(
  fragment: string,
  find: string,
  replace: string
): string | null {
  const blocks = parseFragment(fragment);
  const wanted = parseFragment(find);
  const written = parseFragment(replace);
  if (!wanted.length) {
    if (!written.length || matches(blocks, written, 0, blocks.length).length) {
      return null;
    }
    return [...blocks, ...written].map(blockToLine).join("\n");
  }
  const [at, ...others] = matches(blocks, wanted, 0, blocks.length);
  if (at === undefined || others.length) return null;
  // The new lines sit at the depth of the first one they replace.
  const base = blocks[at].type === "item" ? blocks[at].depth : 0;
  const shallowest = Math.min(
    ...written.flatMap((block) => (block.type === "item" ? [block.depth] : []))
  );
  const shaped = written.map((block): ProfileBlock => {
    if (block.type === "paragraph" && blocks[at].type === "item") {
      return { type: "item", depth: base, text: block.text };
    }
    return block.type === "item"
      ? { ...block, depth: block.depth - shallowest + base }
      : block;
  });
  const next = [
    ...blocks.slice(0, at),
    ...shaped,
    ...blocks.slice(at + wanted.length),
  ]
    .map(blockToLine)
    .join("\n");
  return next === blocks.map(blockToLine).join("\n") ? null : next;
}

const numberPattern = /\p{Nd}+(?:[.,]\p{Nd}+)*%?/gu;

function figures(text: string) {
  return (
    (
      text
        // A date's month is written by the format, not given as a number.
        .replace(/\b(\d{4})-(0[1-9]|1[0-2])(-\d{2})?\b/g, "$1")
        // A percentage is its own figure: "40" given doesn't give "40%".
        .replace(/(\p{Nd})\s*(?:%|por cento|percent)/giu, "$1%")
        .match(numberPattern) ?? []
    ).map((figure) => figure.replace(/,/g, "."))
  );
}

/**
 * The numbers in a proposed text that appear in none of the sources (the
 * profile, the user's own messages): the AI may only write figures the user
 * gave (profile spec, principle 2). A date's month passes with its year,
 * and a percentage only when given as one. It compares figures, not their
 * meaning: a number given for one thing can be written for another, which
 * the user sees when accepting the change.
 */
export function ungivenFigures(text: string, sources: string[]): string[] {
  const given = new Set(sources.flatMap(figures));
  return [...new Set(figures(text))].filter((figure) => !given.has(figure));
}
