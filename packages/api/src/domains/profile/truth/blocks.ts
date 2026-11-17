/**
 * The profile's Markdown as a flat list of blocks, one per line, the way the
 * editor holds it: a heading, a paragraph, a quote or a list item with its
 * indentation depth. The method's file uses nothing else, so the round trip
 * is lossless; anything richer (a table, bold text) stays as literal text in
 * a paragraph.
 */
export type ProfileBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "item"; depth: number; text: string };

// Two spaces per level, as the method's files indent results; a tab or four
// spaces count the same when reading.
const indentUnit = 2;

export function parseBlocks(
  markdown: string,
  // A fragment (a suggestion's lines) keeps its depths as written: its
  // first item may be nested under a line outside it.
  { fragment = false }: { fragment?: boolean } = {}
): ProfileBlock[] {
  const blocks: ProfileBlock[] = [];
  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      blocks.push({ type: "heading", level, text: heading[2] });
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      blocks.push({ type: "quote", text: quote[1] });
      continue;
    }

    const item = /^(\s*)[-*+]\s+(.*)$/.exec(line) ?? /^(\s*)[-*+]$/.exec(line);
    if (item) {
      const indent = item[1].replace(/\t/g, "    ").length;
      blocks.push({
        type: "item",
        depth: Math.round(indent / indentUnit),
        text: item[2] ?? "",
      });
      continue;
    }

    blocks.push({ type: "paragraph", text: line.trim() });
  }
  return fragment ? blocks : normalizeDepths(blocks);
}

/** A list item can be at most one level deeper than the item before it. */
function normalizeDepths(blocks: ProfileBlock[]): ProfileBlock[] {
  let previous = -1;
  return blocks.map((block) => {
    if (block.type !== "item") {
      previous = -1;
      return block;
    }
    const depth = Math.min(block.depth, previous + 1);
    previous = depth;
    return depth === block.depth ? block : { ...block, depth };
  });
}

export function blockToLine(block: ProfileBlock): string {
  switch (block.type) {
    case "heading":
      return `${"#".repeat(block.level)} ${block.text}`;
    case "quote":
      return `> ${block.text}`.trimEnd();
    case "item":
      return `${" ".repeat(block.depth * indentUnit)}- ${block.text}`.trimEnd();
    case "paragraph":
      return block.text;
  }
}

/**
 * Consecutive list items and consecutive quote lines stay together; every
 * other block is separated by a blank line.
 */
export function serializeBlocks(blocks: ProfileBlock[]): string {
  let out = "";
  blocks.forEach((block, index) => {
    const previous = blocks[index - 1];
    if (previous) {
      const together =
        (previous.type === "item" && block.type === "item") ||
        (previous.type === "quote" && block.type === "quote");
      out += together ? "\n" : "\n\n";
    }
    out += blockToLine(block);
  });
  return out ? `${out}\n` : "";
}
