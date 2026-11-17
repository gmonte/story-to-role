import { blockToLine, type ProfileBlock } from "./blocks";
import { readStructure, type ProfileStructure } from "./structure";

/**
 * A part of the profile reviewed on its own: a section, or one experience
 * inside Experience. Its key stays the same while its text changes, so two
 * versions can be compared part by part.
 */
export type ProfileChunk = {
  key: string;
  title: string;
  start: number;
  end: number;
  text: string;
};

/**
 * Each experience's key, in order: its company and title, so it keeps its
 * key while its dates are corrected; a second stint with the same title is
 * numbered.
 */
export function experienceKeys(structure: ProfileStructure): string[] {
  const seen = new Map<string, number>();
  return structure.experiences.map((experience) => {
    const name = experience.parsed
      ? `${experience.parsed.company} — ${experience.parsed.title}`
      : experience.rawTitle;
    const key = `experience:${name.toLowerCase()}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? key : `${key} #${count}`;
  });
}

function text(blocks: ProfileBlock[], start: number, end: number) {
  return blocks.slice(start, end).map(blockToLine).join("\n");
}

export function profileChunks(blocks: ProfileBlock[]): ProfileChunk[] {
  const structure = readStructure(blocks);
  const chunks: ProfileChunk[] = [];
  for (const section of structure.sections) {
    const heading = blocks[section.heading];
    const sectionKey = section.key ?? `other:${heading.text}`;
    if (section.key === "experience" && structure.experiences.length) {
      const first = structure.experiences[0].heading;
      if (first > section.start) {
        chunks.push({
          key: sectionKey,
          title: heading.text,
          start: section.heading,
          end: first,
          text: text(blocks, section.heading, first),
        });
      }
      const keys = experienceKeys(structure);
      for (const [index, experience] of structure.experiences.entries()) {
        chunks.push({
          key: keys[index],
          title: experience.rawTitle,
          start: experience.heading,
          end: experience.end,
          text: text(blocks, experience.heading, experience.end),
        });
      }
      continue;
    }
    chunks.push({
      key: sectionKey,
      title: heading.text,
      start: section.heading,
      end: section.end,
      text: text(blocks, section.heading, section.end),
    });
  }
  return chunks;
}

/**
 * The parts of the draft that are new or differ from the published version
 * (all of them when nothing is published yet): what Validate reviews
 * (profile spec, "Validate and publish").
 */
export function changedChunks(
  draft: ProfileBlock[],
  published: ProfileBlock[] | null
): ProfileChunk[] {
  const chunks = profileChunks(draft);
  if (!published) return chunks.filter((chunk) => chunk.end > chunk.start + 1);
  const before = new Map(
    profileChunks(published).map((chunk) => [chunk.key, chunk.text])
  );
  return chunks.filter(
    (chunk) =>
      before.get(chunk.key) !== chunk.text && chunk.end > chunk.start + 1
  );
}

/** The document's index: section and position titles, for context. */
export function profileIndex(blocks: ProfileBlock[]) {
  return blocks
    .filter((block) => block.type === "heading" && block.level >= 2)
    .map((block) => blockToLine(block))
    .join("\n");
}
