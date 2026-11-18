import { blockToLine, parseBlocks } from "../truth/blocks";
import { readStructure } from "../truth/structure";
import { importSettings } from "./import-settings";

/** One comparison's share of the file. */
export type FilePart = {
  kind: "sections" | "experiences" | "chunk";
  text: string;
  // The headings of the positions it holds (kind "experiences").
  positions: string[];
};

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** The company of a position's heading, for matching the draft's. */
export const companyOf = (heading: string) =>
  heading.split(/\s+[—–-]\s+|:\s+/)[0].trim();

/** Whether a draft position's heading names the same company as the file's. */
export function sameCompany(draftHeading: string, fileHeading: string) {
  const company = normalize(companyOf(draftHeading));
  return company.length >= 3 && normalize(fileHeading).includes(company);
}

function chunksBySize(text: string): FilePart[] {
  const chunks: FilePart[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) {
      chunks.push({ kind: "chunk", text: current.trim(), positions: [] });
    }
    current = "";
  };
  const size = importSettings.chunkCharacters;
  // A paragraph larger than a chunk is cut by size.
  const paragraphs = text
    .split(/\n\s*\n/)
    .flatMap((paragraph) =>
      Array.from({ length: Math.ceil(paragraph.length / size) }, (_, i) =>
        paragraph.slice(i * size, (i + 1) * size)
      )
    );
  for (const paragraph of paragraphs) {
    if (current.length && current.length + paragraph.length > size) push();
    current += `${paragraph}\n\n`;
  }
  push();
  return chunks;
}

/**
 * The file as the parts to compare one by one, or null when one comparison
 * of the whole file is enough. A file in the method's structure (several
 * `###` positions under Experience) gives its other sections as one part,
 * then its positions in small batches, so that no comparison has to hold
 * the whole file. An unstructured one is cut by size only when it is long.
 */
export function splitFile(fileText: string): FilePart[] | null {
  const blocks = parseBlocks(fileText);
  const structure = readStructure(blocks);
  const section = structure.sections.find((s) => s.key === "experience");
  if (section && structure.experiences.length >= 2) {
    const first = structure.experiences[0].heading;
    const parts: FilePart[] = [
      {
        kind: "sections",
        text: [...blocks.slice(0, first), ...blocks.slice(section.end)]
          .map(blockToLine)
          .join("\n"),
        positions: [],
      },
    ];
    let batch: { text: string[]; positions: string[] } | null = null;
    let size = 0;
    const flush = () => {
      if (batch) {
        parts.push({
          kind: "experiences",
          text: batch.text.join("\n"),
          positions: batch.positions,
        });
      }
      batch = null;
      size = 0;
    };
    for (const experience of structure.experiences) {
      const text = blocks
        .slice(experience.heading, experience.end)
        .map(blockToLine)
        .join("\n");
      if (
        batch &&
        (batch.positions.length >= importSettings.experiencesPerCall ||
          size + text.length > importSettings.experienceCharactersPerCall)
      ) {
        flush();
      }
      batch ??= { text: [], positions: [] };
      batch.text.push(text);
      batch.positions.push(experience.rawTitle);
      size += text.length;
    }
    flush();
    return parts;
  }
  return fileText.length > importSettings.splitAboveCharacters
    ? chunksBySize(fileText)
    : null;
}
