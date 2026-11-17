import type { ProfileBlock } from "./blocks";
import { canonicalMonth, isPresent, readRange, type DateRange } from "./dates";
import {
  documentLanguage,
  experienceFieldOf,
  sectionKeyOf,
  type ExperienceField,
  type ProfileLanguage,
  type ProfileSectionKey,
} from "./sections";

/** A `##` section: its heading block and the blocks up to the next one. */
export type ProfileSection = {
  key: ProfileSectionKey | null;
  heading: number;
  start: number;
  end: number;
};

export type ExperienceTitle = {
  company: string;
  title: string;
  range: DateRange;
};

/** A labelled line of an experience ("- Results:") and the items under it. */
export type ExperienceFieldLines = {
  line: number;
  value: string;
  children: number[];
};

export type ProfileExperience = {
  heading: number;
  end: number;
  rawTitle: string;
  // Null when the title isn't in the canonical format.
  parsed: ExperienceTitle | null;
  fields: Partial<Record<ExperienceField, ExperienceFieldLines>>;
};

export type ProfileStructure = {
  language: ProfileLanguage;
  sections: ProfileSection[];
  experiences: ProfileExperience[];
};

export function sectionOf(structure: ProfileStructure, key: ProfileSectionKey) {
  return structure.sections.find((section) => section.key === key);
}

/** The text after the first colon of a labelled line, and the label. */
export function splitLabel(text: string) {
  const colon = text.indexOf(":");
  if (colon < 0) return null;
  return {
    label: text.slice(0, colon),
    value: text.slice(colon + 1).trim(),
    valueStart:
      colon +
      1 +
      (text.slice(colon + 1).length - text.slice(colon + 1).trimStart().length),
  };
}

const canonicalTitle = /^(.+?) — (.+) \((\S+) (?:a|to) (\S+)\)$/;

/**
 * `Company — Title (YYYY-MM to YYYY-MM)`, with `present` (or `atual`) as
 * the end of the current position: anything else is a format finding.
 */
export function readCanonicalTitle(text: string): ExperienceTitle | null {
  const match = canonicalTitle.exec(text.trim());
  if (!match) return null;
  const [, company, title, start, end] = match;
  if (!canonicalMonth.test(start)) return null;
  if (!isPresent(end) && !canonicalMonth.test(end)) return null;
  return {
    company: company.trim(),
    title: title.trim(),
    range: { start, end: isPresent(end) ? "present" : end },
  };
}

/**
 * A title written another recognizable way ("Acme: Engineer (Jan/2021 -
 * present)", "Acme - Engineer | 01/2021 – 03/2023"), for Fix format.
 */
export function readLooseTitle(text: string): ExperienceTitle | null {
  const value = text.trim();
  const withParens = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(value);
  let names = withParens?.[1];
  let range = withParens ? readRange(withParens[2]) : null;
  if (!range) {
    const separated = /^(.*?)\s*[|,]\s*([^|,]+)$/.exec(value);
    names = separated?.[1];
    range = separated ? readRange(separated[2]) : null;
  }
  if (!range || !names) return null;
  const parts = names.split(/\s+[—–-]\s+|:\s+|\s+\|\s+|\s+@\s+/);
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return null;
  return { company: parts[0].trim(), title: parts[1].trim(), range };
}

export function readStructure(blocks: ProfileBlock[]): ProfileStructure {
  const sections: ProfileSection[] = [];
  blocks.forEach((block, index) => {
    if (block.type === "heading" && block.level <= 2) {
      if (block.level === 1) return;
      sections.push({
        key: sectionKeyOf(block.text),
        heading: index,
        start: index + 1,
        end: blocks.length,
      });
    }
  });
  // A `#` title closes the section before it too.
  sections.forEach((section, i) => {
    const next = sections[i + 1]?.heading ?? blocks.length;
    const title = blocks.findIndex(
      (block, index) =>
        index > section.heading &&
        index < next &&
        block.type === "heading" &&
        block.level === 1
    );
    section.end = title >= 0 ? title : next;
  });

  const experiences: ProfileExperience[] = [];
  const experienceSection = sections.find((s) => s.key === "experience");
  if (experienceSection) {
    let current: ProfileExperience | null = null;
    let field: ExperienceFieldLines | null = null;
    for (let i = experienceSection.start; i < experienceSection.end; i++) {
      const block = blocks[i];
      if (block.type === "heading" && block.level === 3) {
        current = {
          heading: i,
          end: experienceSection.end,
          rawTitle: block.text,
          parsed: readCanonicalTitle(block.text),
          fields: {},
        };
        if (experiences.length) experiences[experiences.length - 1].end = i;
        experiences.push(current);
        field = null;
        continue;
      }
      if (!current || block.type !== "item") continue;
      if (block.depth === 0) {
        const labelled = splitLabel(block.text);
        const key = labelled ? experienceFieldOf(labelled.label) : null;
        const existing = key ? current.fields[key] : undefined;
        if (existing) {
          // A label written twice reads as one field with both lines.
          existing.children.push(i);
          field = existing;
        } else {
          field =
            key && labelled
              ? { line: i, value: labelled.value, children: [] }
              : null;
          if (key && field) current.fields[key] = field;
        }
      } else if (field) {
        field.children.push(i);
      }
    }
  }

  return {
    language: documentLanguage(
      sections.map((section) => {
        const block = blocks[section.heading];
        return block.type === "heading" ? block.text : "";
      })
    ),
    sections,
    experiences,
  };
}
