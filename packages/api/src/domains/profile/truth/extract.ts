import type { ProfileBlock } from "./blocks";
import { splitNames } from "./lint";
import { findMarks, type FigureMark } from "./marks";
import {
  competencyLevelOf,
  normalizeLabel,
  type CompetencyLevel,
  type ProfileSectionKey,
} from "./sections";
import { readStructure, sectionOf, splitLabel } from "./structure";

/**
 * What the rest of the product reads from a published version (profile
 * spec, "Data model": profile_extracts): the structure the linter already
 * understands, so screening and generation never parse Markdown.
 */
export type ProfileExtract = {
  experiences: Array<{
    company: string;
    title: string;
    start: string;
    // A month, or "present".
    end: string;
    notDone: string[];
  }>;
  education: Array<{ line: string; inProgress: boolean }>;
  certifications: Array<{
    line: string;
    status: "valid" | "expired" | "renewing";
  }>;
  competencies: Array<{ name: string; level: CompetencyLevel }>;
  languages: string[];
  gaps: string[];
  rules: { neverInclude: string[]; neverClaim: string[] };
  // Each marked figure, with the passage it is in (its ordinal among the
  // version's passages, null when the line isn't one).
  figures: Array<{
    mark: FigureMark;
    text: string;
    experience: number | null;
    passage: number | null;
  }>;
};

/** A passage of a published version, embedded for retrieval (ADR 0004). */
export type ProfilePassage = {
  section: ProfileSectionKey | null;
  // The document lines it holds.
  lines: number[];
  // The experience it belongs to, by order in the document.
  experience: number | null;
  text: string;
};

function itemsOf(
  blocks: ProfileBlock[],
  section: { start: number; end: number } | undefined
) {
  if (!section) return [];
  return blocks
    .slice(section.start, section.end)
    .filter((block) => block.type === "item" && block.depth === 0)
    .map((block) => block.text.trim())
    .filter(Boolean);
}

export function extractProfile(blocks: ProfileBlock[]): ProfileExtract {
  const structure = readStructure(blocks);

  const experiences = structure.experiences.flatMap((experience) => {
    if (!experience.parsed) return [];
    const notDone = experience.fields.notDone;
    return [
      {
        company: experience.parsed.company,
        title: experience.parsed.title,
        start: experience.parsed.range.start,
        end: experience.parsed.range.end,
        notDone: notDone
          ? [
              notDone.value,
              ...notDone.children.map((line) => blocks[line].text),
            ]
              .map((text) => text.trim())
              .filter(Boolean)
          : [],
      },
    ];
  });

  const certifications = itemsOf(
    blocks,
    sectionOf(structure, "certifications")
  ).map((line) => {
    const status = normalizeLabel(line.split(/\s+—\s+/)[3] ?? "");
    return {
      line,
      status: /^(expirada|expired)/.test(status)
        ? ("expired" as const)
        : /^(em renovacao|renewing)/.test(status)
          ? ("renewing" as const)
          : ("valid" as const),
    };
  });

  const competencies: ProfileExtract["competencies"] = [];
  const competencySection = sectionOf(structure, "competencies");
  let level: CompetencyLevel | null = null;
  for (
    let line = competencySection?.start ?? 0;
    competencySection && line < competencySection.end;
    line++
  ) {
    const block = blocks[line];
    if (block.type !== "item") continue;
    const labelled = splitLabel(block.text);
    const own = labelled ? competencyLevelOf(labelled.label) : null;
    if (!block.depth) level = own;
    if (!level) continue;
    for (const { name } of splitNames(
      own && labelled ? labelled.value : block.text
    )) {
      competencies.push({ name, level });
    }
  }

  const rules = { neverInclude: [] as string[], neverClaim: [] as string[] };
  for (const line of itemsOf(blocks, sectionOf(structure, "rules"))) {
    const labelled = splitLabel(line);
    if (!labelled) continue;
    const label = normalizeLabel(labelled.label);
    const names = splitNames(labelled.value, 0, { anyLength: true }).map(
      (n) => n.name
    );
    if (label === "nunca incluir" || label === "never include") {
      rules.neverInclude.push(...names);
    } else if (label === "nunca afirmar" || label === "never claim") {
      rules.neverClaim.push(...names);
    }
  }

  const figures: ProfileExtract["figures"] = [];
  const passages = profilePassages(blocks);
  blocks.forEach((block, line) => {
    const experience = structure.experiences.findIndex(
      (e) => line > e.heading && line < e.end
    );
    for (const match of findMarks(block.text)) {
      figures.push({
        mark: match.mark,
        text: block.text,
        experience: experience >= 0 ? experience : null,
        passage: passageOfLine(passages, line),
      });
    }
  });

  return {
    experiences,
    education: itemsOf(blocks, sectionOf(structure, "education")).map(
      (line) => ({
        line,
        inProgress: /em andamento|in progress/i.test(line),
      })
    ),
    certifications,
    competencies,
    languages: itemsOf(blocks, sectionOf(structure, "languages")),
    gaps: itemsOf(blocks, sectionOf(structure, "gaps")),
    rules,
    figures,
  };
}

/**
 * The passages to embed: each top-level line with the lines under it, an
 * experience's lines prefixed with its title so a passage reads on its own.
 */
export function profilePassages(blocks: ProfileBlock[]): ProfilePassage[] {
  const structure = readStructure(blocks);
  const passages: ProfilePassage[] = [];
  for (const section of structure.sections) {
    let current: ProfilePassage | null = null;
    for (let line = section.start; line < section.end; line++) {
      const block = blocks[line];
      const experience = structure.experiences.findIndex(
        (e) => line > e.heading && line < e.end
      );
      const prefix =
        experience >= 0
          ? `${structure.experiences[experience].rawTitle}: `
          : "";
      if (block.type === "item" && block.depth > 0 && current) {
        current.text += `\n${block.text}`;
        current.lines.push(line);
        continue;
      }
      if (block.type === "heading" || !block.text.trim()) {
        current = null;
        continue;
      }
      current = {
        section: section.key,
        lines: [line],
        experience: experience >= 0 ? experience : null,
        text: `${prefix}${block.text}`,
      };
      passages.push(current);
    }
  }
  // A label with nothing written after it says nothing.
  return passages.filter((passage) => !/:\s*$/.test(passage.text));
}

function passageOfLine(passages: ProfilePassage[], line: number) {
  const index = passages.findIndex((passage) => passage.lines.includes(line));
  return index >= 0 ? index : null;
}
