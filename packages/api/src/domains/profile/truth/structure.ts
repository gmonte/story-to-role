import type { ProfileBlock } from "./blocks";
import { canonicalMonth, isPresent, readRange, type DateRange } from "./dates";
import {
  documentLanguage,
  experienceFieldOf,
  isProjectLinkLabel,
  isProjectRoleLabel,
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

/** `### Name (YYYY-MM to YYYY-MM)`: a project has no employer or title. */
export type ProjectTitle = { name: string; range: DateRange };

/**
 * A project of the Projects section (profile spec, "The document"):
 * personal or side work that is not a position, with the experience's
 * labelled lines where they fit and an optional link line.
 */
export type ProfileProject = {
  heading: number;
  end: number;
  rawTitle: string;
  parsed: ProjectTitle | null;
  fields: Partial<Record<ExperienceField, ExperienceFieldLines>>;
  // "Role: Founder": what the person was to the project, optional.
  role: { line: number; value: string } | null;
  link: { line: number; value: string } | null;
};

export type ProfileStructure = {
  language: ProfileLanguage;
  sections: ProfileSection[];
  experiences: ProfileExperience[];
  projects: ProfileProject[];
};

export function sectionOf(structure: ProfileStructure, key: ProfileSectionKey) {
  return structure.sections.find((section) => section.key === key);
}

/**
 * Whether a section has nothing under its heading but grey hints (quote
 * lines) and empty labels ("- Results:"): such a section is never used to
 * build documents or reviews, whatever its heading says.
 */
export function isEmptySection(
  blocks: ProfileBlock[],
  section: { heading: number; end: number }
) {
  return blocks.slice(section.heading + 1, section.end).every((block) => {
    if (block.type === "quote") return true;
    if (block.type === "heading") return false;
    const labelled = splitLabel(block.text);
    return !block.text.trim() || (!!labelled && !labelled.value);
  });
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

const canonicalProjectTitle = /^(.+?) \((\S+) (?:a|to) (\S+)\)$/;

/** `Name (YYYY-MM to YYYY-MM)`, with `present` for an ongoing project. */
export function readCanonicalProjectTitle(text: string): ProjectTitle | null {
  const match = canonicalProjectTitle.exec(text.trim());
  if (!match) return null;
  const [, name, start, end] = match;
  if (!canonicalMonth.test(start)) return null;
  if (!isPresent(end) && !canonicalMonth.test(end)) return null;
  return {
    name: name.trim(),
    range: { start, end: isPresent(end) ? "present" : end },
  };
}

/**
 * A project title written another recognizable way ("App (Jan/2024 -
 * present)", "App | 01/2024 – atual"), for Fix format.
 */
export function readLooseProjectTitle(text: string): ProjectTitle | null {
  const value = text.trim();
  const withParens = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(value);
  let name = withParens?.[1];
  let range = withParens ? readRange(withParens[2]) : null;
  if (!range) {
    const separated = /^(.*?)\s*[|,—–]\s*([^|,—–]+)$/.exec(value);
    name = separated?.[1];
    range = separated ? readRange(separated[2]) : null;
  }
  if (!range || !name?.trim()) return null;
  return { name: name.trim(), range };
}

/**
 * The `###` entries of a section with their labelled lines: an experience
 * or a project, read the same way under their own title format.
 */
function readEntries<Title>(
  blocks: ProfileBlock[],
  section: ProfileSection | undefined,
  parseTitle: (text: string) => Title | null
) {
  type Entry = {
    heading: number;
    end: number;
    rawTitle: string;
    parsed: Title | null;
    fields: Partial<Record<ExperienceField, ExperienceFieldLines>>;
    // A labelled line that isn't a field (a project's link).
    other: Array<{ line: number; label: string; value: string }>;
  };
  const entries: Entry[] = [];
  if (!section) return entries;
  let current: Entry | null = null;
  let field: ExperienceFieldLines | null = null;
  for (let i = section.start; i < section.end; i++) {
    const block = blocks[i];
    if (block.type === "heading" && block.level === 3) {
      current = {
        heading: i,
        end: section.end,
        rawTitle: block.text,
        parsed: parseTitle(block.text),
        fields: {},
        other: [],
      };
      if (entries.length) entries[entries.length - 1].end = i;
      entries.push(current);
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
        if (!key && labelled) {
          current.other.push({
            line: i,
            label: labelled.label,
            value: labelled.value,
          });
        }
      }
    } else if (field) {
      field.children.push(i);
    }
  }
  return entries;
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

  const experiences: ProfileExperience[] = readEntries(
    blocks,
    sections.find((s) => s.key === "experience"),
    readCanonicalTitle
  ).map(({ other: _other, ...experience }) => experience);

  const projects: ProfileProject[] = readEntries(
    blocks,
    sections.find((s) => s.key === "projects"),
    readCanonicalProjectTitle
  ).map(({ other, ...project }) => {
    const link = other.find((line) => isProjectLinkLabel(line.label));
    const role = other.find((line) => isProjectRoleLabel(line.label));
    return {
      ...project,
      role: role ? { line: role.line, value: role.value } : null,
      link: link ? { line: link.line, value: link.value } : null,
    };
  });

  return {
    language: documentLanguage(
      sections.map((section) => {
        const block = blocks[section.heading];
        return block.type === "heading" ? block.text : "";
      })
    ),
    sections,
    experiences,
    projects,
  };
}
