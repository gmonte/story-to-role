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

/** The ordered recognised headings (level and text) of a list of blocks. */
export function lockedHeadingsOf(blocks: ProfileBlock[]) {
  return blocks.flatMap((block) =>
    block.type === "heading" && isLockedHeading(block.level, block.text)
      ? [`${block.level}:${block.text}`]
      : []
  );
}

export function lockedHeadings(doc: ProseMirrorNode) {
  return lockedHeadingsOf(docToBlocks(doc));
}

/** Whether two documents have the same recognised headings, in order. */
export function sameLockedHeadings(a: ProseMirrorNode, b: ProseMirrorNode) {
  const first = lockedHeadings(a);
  const second = lockedHeadings(b);
  return (
    first.length === second.length &&
    first.every((heading, i) => heading === second[i])
  );
}

/** Whether a top-level node is one of the locked headings. */
export function isLockedNode(node: ProseMirrorNode) {
  return (
    node.type.name === "heading" &&
    isLockedHeading(node.attrs.level as number, node.textContent)
  );
}
