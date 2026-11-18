import {
  letterPart,
  locateInLines,
  skillLine,
  skillsPart,
  summaryPart,
  type DocumentChange,
} from "@repo/api/domains/documents/changes/document-change";

import type { DocumentBlock } from "./document-blocks";

/** The part key a block's line belongs to, when the agent may change it. */
export function partOfBlock(block: DocumentBlock): string | null {
  switch (block.type) {
    case "summary":
      return summaryPart;
    case "skill":
      return skillsPart;
    case "bullet":
      return block.ownerId;
    case "paragraph":
      return letterPart;
    default:
      return null;
  }
}

/** A block's text as a change quotes it (a skills line with its label). */
const lineOf = (block: DocumentBlock) =>
  block.type === "skill" ? skillLine(block) : "text" in block ? block.text : "";

/**
 * The blocks a change replaces in the editor as it is now ({start, end}
 * block indices, equal for an addition placed after the part's last
 * line), or null when it is stale (see `locateInLines`). A position's or
 * project's key names its id; the editor's bullets carry it as their
 * owner.
 */
export function locateChangeInBlocks(
  blocks: DocumentBlock[],
  change: Pick<DocumentChange, "part" | "find" | "replace">
): { start: number; end: number } | null {
  const [kind, id] = change.part.split(":");
  const key = id ?? kind;
  const indices = blocks.flatMap((block, index) =>
    partOfBlock(block) === key ? [index] : []
  );
  if (!indices.length) {
    // An empty position: its bullets go right after its heading.
    const owner = blocks.findIndex(
      (block) => block.type === "entry" && block.ownerId === key
    );
    if (owner < 0 || change.find.trim()) return null;
    const range = locateInLines([], change);
    return range && { start: owner + 1, end: owner + 1 };
  }
  const range = locateInLines(
    indices.map((index) => lineOf(blocks[index])),
    change
  );
  if (!range) return null;
  if (range.start === range.end) {
    const after = indices[indices.length - 1] + 1;
    return { start: after, end: after };
  }
  return { start: indices[range.start], end: indices[range.end - 1] + 1 };
}
