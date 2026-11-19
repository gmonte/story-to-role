export type DiffSegment = { text: string; changed: boolean };

export type WordDiff = {
  /** The replaced text, with the removed runs flagged. */
  old: DiffSegment[];
  /** The new text, with the inserted runs flagged. */
  new: DiffSegment[];
  /** Share of words the two texts have in common, from 0 to 1. */
  similarity: number;
  /** A word diff would be noise: show both texts whole. */
  fallback: boolean;
};

export type LineDiff = {
  /** Per replaced line, its segments. */
  old: DiffSegment[][];
  /** Per new line, its segments. */
  new: DiffSegment[][];
  fallback: boolean;
};

/** Under this share of common words the texts are shown whole. */
export const MIN_SIMILARITY = 0.4;

const tokenPattern = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;
const isSpace = (token: string) => /^\s+$/u.test(token);
const isWord = (token: string) => /[\p{L}\p{N}]/u.test(token);

export const tokenize = (text: string) => text.match(tokenPattern) ?? [];

function merge(segments: DiffSegment[]) {
  const result: DiffSegment[] = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    const last = result[result.length - 1];
    if (last?.changed === segment.changed) last.text += segment.text;
    else result.push({ ...segment });
  }
  return result;
}

// Whitespace between two changed runs belongs to the change.
function bridge(segments: DiffSegment[]) {
  const merged = merge(segments);
  merged.forEach((segment, index) => {
    const before = merged[index - 1];
    const after = merged[index + 1];
    if (before?.changed && after?.changed && isSpace(segment.text)) {
      segment.changed = true;
    }
  });
  return merge(merged);
}

/** Word-level diff between two texts: LCS over words, spaces, punctuation. */
export function wordDiff(before: string, after: string): WordDiff {
  const a = tokenize(before);
  const b = tokenize(after);
  // Any whitespace matches any whitespace; the side keeps its own.
  const same = (x: string, y: string) => x === y || (isSpace(x) && isSpace(y));
  const table = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = same(a[i], b[j])
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const oldSegments: DiffSegment[] = [];
  const newSegments: DiffSegment[] = [];
  let common = 0;
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && same(a[i], b[j])) {
      if (isWord(a[i])) common++;
      oldSegments.push({ text: a[i], changed: false });
      newSegments.push({ text: b[j], changed: false });
      i++;
      j++;
    } else if (
      j >= b.length ||
      (i < a.length && table[i + 1][j] >= table[i][j + 1])
    ) {
      oldSegments.push({ text: a[i++], changed: true });
    } else {
      newSegments.push({ text: b[j++], changed: true });
    }
  }
  const words = Math.max(a.filter(isWord).length, b.filter(isWord).length);
  const similarity = words ? common / words : 0;
  return {
    old: bridge(oldSegments),
    new: bridge(newSegments),
    similarity,
    fallback: !before.trim() || !after.trim() || similarity < MIN_SIMILARITY,
  };
}

function splitLines(segments: DiffSegment[]) {
  const lines: DiffSegment[][] = [[]];
  for (const segment of segments) {
    segment.text.split("\n").forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...segment, text: part });
    });
  }
  return lines;
}

const whole = (lines: string[]) =>
  lines.map((text) => (text ? [{ text, changed: false }] : []));

/**
 * The diff of a suggestion's lines: line by line when the counts match,
 * otherwise over the whole passage; whole texts when it'd be noise.
 */
export function lineDiff(before: string[], after: string[]): LineDiff {
  const fallback = { old: whole(before), new: whole(after), fallback: true };
  if (!before.length || !after.length) return fallback;
  if (before.length === after.length) {
    const pairs = before.map((line, index) => wordDiff(line, after[index]));
    const total = (pick: (line: string) => number) =>
      before.reduce((sum, line) => sum + pick(line), 0);
    const words = (text: string) => tokenize(text).filter(isWord).length;
    const oldWords = total(words);
    const newWords = after.reduce((sum, line) => sum + words(line), 0);
    const all = Math.max(oldWords, newWords);
    const common = pairs.reduce(
      (sum, pair, index) =>
        sum +
        pair.similarity * Math.max(words(before[index]), words(after[index])),
      0
    );
    if (!all || common / all < MIN_SIMILARITY) return fallback;
    return {
      old: pairs.map((pair) => pair.old),
      new: pairs.map((pair) => pair.new),
      fallback: false,
    };
  }
  const diff = wordDiff(before.join("\n"), after.join("\n"));
  if (diff.fallback) return fallback;
  return {
    old: splitLines(diff.old),
    new: splitLines(diff.new),
    fallback: false,
  };
}

/**
 * How many whole lines a change leaves alone at its start and at its end
 * (compared as keys: the line's kind, depth and text). A suggestion that
 * only appends a sub-item after its parent shows just the new line, not
 * the parent struck and written again.
 */
export function unchangedEnds(before: string[], after: string[]) {
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }
  return { prefix, suffix };
}

/** A block's key for `unchangedEnds`. */
export const lineKey = (block: {
  type: string;
  text: string;
  depth?: number;
}) => `${block.type}:${block.depth ?? 0}:${block.text}`;
