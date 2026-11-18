import type { ProfileBlock } from "../truth/blocks";
import { normalizeLabel } from "../truth/sections";
import { splitLabel } from "../truth/structure";

export type PublicName = { original: string; public: string };

const arrow = /\s*(?:→|->|=>)\s*/;

/**
 * Reads the value of a “Public names” line: entries split on `;` only
 * (a name may hold commas), each `original → public form` (`→`, `->` or
 * `=>`). An entry missing a side is returned apart, for the linter.
 */
export function parsePublicNames(value: string) {
  const entries: PublicName[] = [];
  const malformed: string[] = [];
  for (const raw of value.split(";")) {
    const item = raw.trim().replace(/\.$/, "").trim();
    if (!item) continue;
    const [original = "", ...rest] = item.split(arrow);
    const publicForm = rest.join(" → ").trim();
    if (original.trim() && publicForm) {
      entries.push({ original: original.trim(), public: publicForm });
    } else {
      malformed.push(item);
    }
  }
  return { entries, malformed };
}

export const publicNamesLabels = ["nomes publicos", "public names"];

/**
 * The values of the “Public names” lines of a rules section, each with the
 * block it is on: the entries written on the line itself (`;`-separated)
 * and those written as sub-items under it, one per line.
 */
export function publicNameValues(
  blocks: ProfileBlock[],
  section: { start: number; end: number }
) {
  const values: Array<{ line: number; value: string }> = [];
  let inside = false;
  for (let line = section.start; line < section.end; line++) {
    const block = blocks[line];
    if (block.type !== "item") continue;
    if (block.depth === 0) {
      const labelled = splitLabel(block.text);
      inside =
        !!labelled &&
        publicNamesLabels.includes(normalizeLabel(labelled.label));
      if (inside && labelled?.value.trim()) {
        values.push({ line, value: labelled.value });
      }
    } else if (inside && block.text.trim()) {
      values.push({ line, value: block.text });
    }
  }
  return values;
}
