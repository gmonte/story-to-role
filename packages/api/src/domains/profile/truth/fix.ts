import type { ProfileBlock } from "./blocks";
import { readMonth } from "./dates";
import { lintProfile, type ProfileFinding } from "./lint";
import { canonicalMarkText, findMarks } from "./marks";
import {
  profileSectionKeys,
  sectionHeadings,
  type ProfileLanguage,
  type ProfileSectionKey,
} from "./sections";
import { readLooseTitle, readStructure } from "./structure";
import { experienceTitle, sectionTemplate } from "./template";

const statusBlank: Record<ProfileLanguage, string> = {
  "pt-BR": "situação",
  "en-US": "status",
};

function replaceText(blocks: ProfileBlock[], line: number, text: string) {
  return blocks.map((block, index) =>
    index === line ? { ...block, text } : block
  );
}

/** Puts the recognized sections back in the template's order. */
function reorderSections(blocks: ProfileBlock[]) {
  const structure = readStructure(blocks);
  const sections = structure.sections;
  if (!sections.length) return blocks;
  const head = blocks.slice(0, sections[0].heading);
  const chunks = sections.map((section, index) => ({
    key: section.key,
    index,
    blocks: blocks.slice(
      section.heading,
      sections[index + 1]?.heading ?? blocks.length
    ),
  }));
  // Unrecognized sections keep their place after the section they follow.
  let lastOrder = -1;
  const ranked = chunks.map((chunk) => {
    if (chunk.key) lastOrder = profileSectionKeys.indexOf(chunk.key);
    return { ...chunk, order: lastOrder + (chunk.key ? 0 : 0.5) };
  });
  ranked.sort((a, b) => a.order - b.order || a.index - b.index);
  return [...head, ...ranked.flatMap((chunk) => chunk.blocks)];
}

/** Inserts a missing section, with its template lines, where it belongs. */
function insertSection(blocks: ProfileBlock[], key: ProfileSectionKey) {
  const structure = readStructure(blocks);
  const order = profileSectionKeys.indexOf(key);
  const after = structure.sections.filter(
    (section) => section.key && profileSectionKeys.indexOf(section.key) > order
  );
  const at = after.length
    ? Math.min(...after.map((section) => section.heading))
    : blocks.length;
  return [
    ...blocks.slice(0, at),
    ...sectionTemplate(key, structure.language),
    ...blocks.slice(at),
  ];
}

/** Applies the fix for one finding, when code can fix it with certainty. */
export function fixFinding(
  blocks: ProfileBlock[],
  finding: ProfileFinding
): ProfileBlock[] {
  const language = readStructure(blocks).language;
  const block = finding.line === null ? null : blocks[finding.line];
  switch (finding.code) {
    case "missingSection":
      return insertSection(
        blocks,
        finding.params?.section as ProfileSectionKey
      );
    case "sectionOrder":
      return reorderSections(blocks);
    case "experienceTitle": {
      const loose = block && readLooseTitle(block.text);
      return loose && finding.line !== null
        ? replaceText(blocks, finding.line, experienceTitle(loose, language))
        : blocks;
    }
    case "dateFormat": {
      if (!block || finding.line === null) return blocks;
      const date = block.text.slice(finding.from, finding.to);
      const month = readMonth(date);
      if (!month) return blocks;
      return replaceText(
        blocks,
        finding.line,
        block.text.slice(0, finding.from) + month + block.text.slice(finding.to)
      );
    }
    case "markFormat": {
      if (!block || finding.line === null) return blocks;
      const match = findMarks(block.text).find((m) => m.from === finding.from);
      if (!match) return blocks;
      return replaceText(
        blocks,
        finding.line,
        block.text.slice(0, match.from) +
          canonicalMarkText(match, language) +
          block.text.slice(match.to)
      );
    }
    case "certificationStatus":
      return block && finding.line !== null
        ? replaceText(
            blocks,
            finding.line,
            `${block.text} — ${statusBlank[language]}`
          )
        : blocks;
    default:
      return blocks;
  }
}

/**
 * Fix format for the whole document: applies every fixable finding, one at a
 * time (a fix can move lines), until nothing fixable is left.
 */
export function fixFormat(blocks: ProfileBlock[]): ProfileBlock[] {
  let current = blocks;
  // Each pass fixes one finding; a document has far fewer than this.
  for (let pass = 0; pass < 500; pass++) {
    const next = lintProfile(current).find((finding) => {
      if (!finding.fixable) return false;
      return fixFinding(current, finding) !== current;
    });
    if (!next) return current;
    current = fixFinding(current, next);
  }
  return current;
}

export { sectionHeadings };
