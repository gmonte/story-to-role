import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { ProfileBlock } from "@repo/api/domains/profile/truth/blocks";
import { sectionKeyOf } from "@repo/api/domains/profile/truth/sections";

const text = (value: string): JSONContent[] =>
  value ? [{ type: "text", text: value }] : [];

/**
 * The editor holds the profile as flat blocks, one per Markdown line
 * (ProfileBlock): a heading, a paragraph, a quote line or a list item with
 * its depth. These convert between the two.
 */
export function blocksToDoc(blocks: ProfileBlock[]): JSONContent {
  const content = blocks.map((block): JSONContent => {
    switch (block.type) {
      case "heading":
        return {
          type: "heading",
          attrs: { level: block.level },
          content: text(block.text),
        };
      case "quote":
        return { type: "profileQuote", content: text(block.text) };
      case "item":
        return {
          type: "profileItem",
          attrs: { depth: block.depth },
          content: text(block.text),
        };
      case "paragraph":
        return { type: "paragraph", content: text(block.text) };
    }
  });
  return {
    type: "doc",
    content: content.length ? content : [{ type: "paragraph" }],
  };
}

export function nodeToBlock(node: ProseMirrorNode): ProfileBlock {
  const value = node.textContent;
  switch (node.type.name) {
    case "heading":
      return {
        type: "heading",
        level: node.attrs.level as 1 | 2 | 3,
        text: value,
      };
    case "profileQuote":
      return { type: "quote", text: value };
    case "profileItem":
      return { type: "item", depth: node.attrs.depth as number, text: value };
    default:
      return { type: "paragraph", text: value };
  }
}

/** The document's blocks; empty paragraphs (a blank line) aren't lines. */
export function docToBlocks(doc: ProseMirrorNode): ProfileBlock[] {
  const blocks: ProfileBlock[] = [];
  doc.forEach((node) => {
    if (node.type.name === "paragraph" && !node.textContent.trim()) return;
    blocks.push(nodeToBlock(node));
  });
  return blocks;
}

/**
 * Where each top-level node starts, by block index (skipping the empty
 * paragraphs docToBlocks leaves out), so a finding's line maps to the text.
 */
export function blockPositions(doc: ProseMirrorNode) {
  const positions: number[] = [];
  doc.forEach((node, offset) => {
    if (node.type.name === "paragraph" && !node.textContent.trim()) return;
    positions.push(offset);
  });
  return positions;
}

/** The document's `#` title and the template's `##` sections can't be edited. */
export function isLockedHeading(level: number, text: string) {
  return level === 1 || (level === 2 && sectionKeyOf(text) !== null);
}

/**
 * The indexes of the locked headings: the title and the first heading of
 * each recognised section. A repeated heading is an ordinary line, which
 * the user can delete (the linter flags it).
 */
export function lockedHeadingIndexes(blocks: ProfileBlock[]) {
  const locked = new Set<number>();
  const seen = new Set<string>();
  blocks.forEach((block, index) => {
    if (block.type !== "heading" || !isLockedHeading(block.level, block.text)) {
      return;
    }
    if (block.level === 2) {
      const key = sectionKeyOf(block.text)!;
      if (seen.has(key)) return;
      seen.add(key);
    }
    locked.add(index);
  });
  return locked;
}

/** The ordered locked headings (level and text) of a list of blocks. */
export function lockedHeadingsOf(blocks: ProfileBlock[]) {
  const locked = lockedHeadingIndexes(blocks);
  return blocks.flatMap((block, index) =>
    block.type === "heading" && locked.has(index)
      ? [`${block.level}:${block.text}`]
      : []
  );
}

/** Where each locked top-level node of the document starts. */
export function lockedNodeOffsets(doc: ProseMirrorNode) {
  const locked = lockedHeadingIndexes(docToBlocks(doc));
  return blockPositions(doc).filter((_, index) => locked.has(index));
}

export function lockedHeadings(doc: ProseMirrorNode) {
  return lockedHeadingsOf(docToBlocks(doc));
}

/** Whether two documents have the same locked headings, in order. */
export function sameLockedHeadings(a: ProseMirrorNode, b: ProseMirrorNode) {
  const first = lockedHeadings(a);
  const second = lockedHeadings(b);
  return (
    first.length === second.length &&
    first.every((heading, i) => heading === second[i])
  );
}

/**
 * Where the profile's opening note starts (the template's quote lines
 * before the first section): fixed like the title.
 */
export function introNoteOffsets(doc: ProseMirrorNode) {
  const offsets: number[] = [];
  let reachedSection = false;
  doc.forEach((node, offset) => {
    if (reachedSection) return;
    if (node.type.name === "heading" && (node.attrs.level as number) >= 2) {
      reachedSection = true;
    } else if (node.type.name === "profileQuote") {
      offsets.push(offset);
    }
  });
  return offsets;
}

/**
 * Whether the top-level block at `index` is fixed: the title, a template
 * section's heading or a line of the opening note. It has no drag handle
 * and doesn't move.
 */
export function isFixedBlock(doc: ProseMirrorNode, index: number) {
  if (index >= doc.childCount) return false;
  if (isLockedNode(doc.child(index))) return true;
  let offset = 0;
  for (let i = 0; i < index; i++) offset += doc.child(i).nodeSize;
  return introNoteOffsets(doc).includes(offset);
}

/** The opening note's lines, to tell whether a change touched them. */
export function introNote(doc: ProseMirrorNode) {
  return introNoteOffsets(doc).map((offset) => doc.nodeAt(offset)?.textContent);
}

/** Whether a top-level node is one of the locked headings. */
export function isLockedNode(node: ProseMirrorNode) {
  return (
    node.type.name === "heading" &&
    isLockedHeading(node.attrs.level as number, node.textContent)
  );
}
