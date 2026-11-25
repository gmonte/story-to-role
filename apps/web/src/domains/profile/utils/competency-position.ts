import type { ProfileBlock } from "@repo/api/domains/profile/truth/blocks";
import { splitNames } from "@repo/api/domains/profile/truth/lint";
import {
  readStructure,
  sectionOf,
  splitLabel,
} from "@repo/api/domains/profile/truth/structure";

/**
 * Where a competency is named under Competencies: its line and the name's
 * offsets in it, for the editor to select. Null when the section doesn't
 * list it.
 */
export function competencyPosition(blocks: ProfileBlock[], name: string) {
  const section = sectionOf(readStructure(blocks), "competencies");
  if (!section) return null;
  const wanted = name.trim().toLowerCase();
  for (let line = section.start; line < section.end; line++) {
    const block = blocks[line];
    if (block.type !== "item") continue;
    const labelled = splitLabel(block.text);
    const names = labelled
      ? splitNames(labelled.value, labelled.valueStart)
      : splitNames(block.text);
    const found = names.find((n) => n.name.toLowerCase() === wanted);
    if (found) return { line, from: found.from, to: found.to };
  }
  return null;
}
