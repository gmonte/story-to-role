import {
  aboutPart,
  closingPart,
  educationPart,
  factsPart,
  greetingPart,
  headerPart,
  headlinePart,
  letterPart,
  locateInLines,
  skillLine,
  skillsPart,
  summaryPart,
  type DocumentChange,
} from "@repo/api/domains/documents/changes/document-change";
import {
  moveSectionNextTo,
  sectionMoveOf,
} from "@repo/api/domains/documents/changes/section-order";

import type { DocumentBlock } from "./document-blocks";

/**
 * Whether a block is a line of a part. A position's or project's bullets
 * key names its id, which the editor's bullets carry as their owner; the
 * facts of a position are its employer, title and context blocks.
 */
export function blockInPart(block: DocumentBlock, part: string) {
  const [kind, id] = part.split(":");
  switch (block.type) {
    case "name":
    case "titleLine":
    case "contacts":
    case "city":
      return part === headerPart;
    case "summary":
      return part === summaryPart;
    case "skill":
      return part === skillsPart;
    case "bullet":
      return (
        (kind === "experience" || kind === "projects") && id === block.ownerId
      );
    case "entry":
    case "entryTitle":
    case "entryContext":
    case "entryLink":
      return part === factsPart(block.ownerId);
    case "greeting":
      return part === greetingPart;
    // A letter's paragraphs, or a LinkedIn text's About.
    case "paragraph":
      return part === letterPart || part === aboutPart;
    case "headline":
      return part === headlinePart;
    case "description":
      return part === educationPart(block.ownerId);
    case "closing":
      return part === closingPart;
    default:
      return false;
  }
}

/** A block's text as a change quotes it (a skills line with its label). */
const lineOf = (block: DocumentBlock) =>
  block.type === "skill" ? skillLine(block) : "text" in block ? block.text : "";

/**
 * The blocks a change replaces in the editor as it is now ({start, end}
 * block indices, equal for an addition placed after the part's last
 * line), or null when it is stale (see `locateInLines`).
 */
export function locateChangeInBlocks(
  blocks: DocumentBlock[],
  change: Pick<DocumentChange, "part" | "find" | "replace">
): { start: number; end: number } | null {
  const move = sectionMoveOf(change);
  if (move) {
    // A section move sits on the section's title; stale when it no longer
    // changes anything (the section moved already, or is gone).
    const titles = blocks.flatMap((block, index) =>
      block.type === "sectionTitle" ? [{ kind: block.kind, index }] : []
    );
    if (!moveSectionNextTo(titles, move)) return null;
    const at = titles.find((title) => title.kind === move.kind)!.index;
    return { start: at, end: at + 1 };
  }
  const indices = blocks.flatMap((block, index) =>
    blockInPart(block, change.part) ? [index] : []
  );
  if (!indices.length) {
    // An empty position: its bullets go right after its heading.
    const [, id] = change.part.split(":");
    const owner = blocks.findLastIndex(
      (block) => "ownerId" in block && block.ownerId === id
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
