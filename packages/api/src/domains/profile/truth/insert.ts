import type { ProfileBlock } from "./blocks";
import type { DateRange } from "./dates";
import {
  competencyLabels,
  competencyLevelOf,
  profileSectionKeys,
  type CompetencyLevel,
  type ProfileLanguage,
  type ProfileSectionKey,
} from "./sections";
import { splitNames } from "./lint";
import { readStructure, sectionOf, splitLabel } from "./structure";
import { experienceTemplate, sectionTemplate } from "./template";

/** What the insert menu adds (profile spec, "The editor"). */
export type ProfileEntry =
  | { kind: "experience"; company: string; title: string; range: DateRange }
  | {
      kind: "education";
      course: string;
      institution: string;
      // Null when completed; the month it ends while in progress.
      inProgressUntil: string | null;
    }
  | {
      kind: "certification";
      name: string;
      issuer: string;
      date: string;
      status: "valid" | "expired" | "renewing";
      expiredOn: string | null;
    }
  | { kind: "language"; language: string; level: string }
  | { kind: "competency"; name: string; level: CompetencyLevel }
  | { kind: "gap"; text: string }
  | { kind: "rule"; rule: "neverInclude" | "neverClaim"; text: string };

export type ProfileEntryKind = ProfileEntry["kind"];

const sectionOfEntry: Record<ProfileEntryKind, ProfileSectionKey> = {
  experience: "experience",
  education: "education",
  certification: "certifications",
  language: "languages",
  competency: "competencies",
  gap: "gaps",
  rule: "rules",
};

const words: Record<
  ProfileLanguage,
  {
    completed: string;
    inProgressUntil: string;
    valid: string;
    expiredOn: string;
    renewing: string;
    neverInclude: string;
    neverClaim: string;
  }
> = {
  "pt-BR": {
    completed: "concluído",
    inProgressUntil: "em andamento até",
    valid: "válida",
    expiredOn: "expirada em",
    renewing: "em renovação",
    neverInclude: "Nunca incluir",
    neverClaim: "Nunca afirmar",
  },
  "en-US": {
    completed: "completed",
    inProgressUntil: "in progress until",
    valid: "valid",
    expiredOn: "expired in",
    renewing: "renewing",
    neverInclude: "Never include",
    neverClaim: "Never claim",
  },
};

/** The line an entry is written as (all but an experience, which is a block). */
export function entryLine(entry: ProfileEntry, language: ProfileLanguage) {
  const w = words[language];
  switch (entry.kind) {
    case "education":
      return `${entry.course} — ${entry.institution} — ${
        entry.inProgressUntil
          ? `${w.inProgressUntil} ${entry.inProgressUntil}`
          : w.completed
      }`;
    case "certification": {
      const status =
        entry.status === "valid"
          ? w.valid
          : entry.status === "renewing"
            ? w.renewing
            : `${w.expiredOn} ${entry.expiredOn ?? ""}`.trim();
      return `${entry.name} — ${entry.issuer} — ${entry.date} — ${status}`;
    }
    case "language":
      return `${entry.language} — ${entry.level}`;
    case "gap":
      return entry.text;
    default:
      return "";
  }
}

/** Where the section ends, after creating it when it's missing. */
function ensureSection(blocks: ProfileBlock[], key: ProfileSectionKey) {
  let structure = readStructure(blocks);
  if (!sectionOf(structure, key)) {
    const after = structure.sections.filter(
      (section) =>
        section.key &&
        profileSectionKeys.indexOf(section.key) >
          profileSectionKeys.indexOf(key)
    );
    const at = after.length
      ? Math.min(...after.map((s) => s.heading))
      : blocks.length;
    blocks = [
      ...blocks.slice(0, at),
      ...sectionTemplate(key, structure.language),
      ...blocks.slice(at),
    ];
    structure = readStructure(blocks);
  }
  return { blocks, structure, section: sectionOf(structure, key)! };
}

function insertAt(
  blocks: ProfileBlock[],
  at: number,
  inserted: ProfileBlock[]
) {
  return [...blocks.slice(0, at), ...inserted, ...blocks.slice(at)];
}

/**
 * Inserts an entry in its section, in the template's format and in order
 * (an experience by its dates, most recent first), creating the section
 * when it's missing. Returns the new blocks and the line of the entry.
 */
export function insertEntry(
  input: ProfileBlock[],
  entry: ProfileEntry
): { blocks: ProfileBlock[]; line: number } {
  const { blocks, structure, section } = ensureSection(
    input,
    sectionOfEntry[entry.kind]
  );
  const language = structure.language;

  if (entry.kind === "experience") {
    const end = entry.range.end === "present" ? "9999-12" : entry.range.end;
    // Before the first experience that started earlier (or ended earlier).
    const before = structure.experiences.find((experience) => {
      if (!experience.parsed) return false;
      const other = experience.parsed.range;
      const otherEnd = other.end === "present" ? "9999-12" : other.end;
      return (
        other.start < entry.range.start ||
        (other.start === entry.range.start && otherEnd < end)
      );
    });
    const at = before?.heading ?? section.end;
    return {
      blocks: insertAt(blocks, at, experienceTemplate(entry, language)),
      line: at,
    };
  }

  if (entry.kind === "competency" || entry.kind === "rule") {
    const label =
      entry.kind === "competency"
        ? competencyLabels[language][entry.level]
        : words[language][entry.rule];
    const name = entry.kind === "competency" ? entry.name : entry.text;
    for (let line = section.start; line < section.end; line++) {
      const block = blocks[line];
      if (block.type !== "item" || block.depth) continue;
      const labelled = splitLabel(block.text);
      if (!labelled) continue;
      const matches =
        entry.kind === "competency"
          ? competencyLevelOf(labelled.label) === entry.level
          : labelled.label.trim().toLowerCase() === label.toLowerCase();
      if (!matches) continue;
      const value = labelled.value.replace(/\.$/, "");
      const text = `${block.text.slice(0, block.text.indexOf(":") + 1)} ${
        value ? `${value}, ${name}` : name
      }`;
      return {
        blocks: blocks.map((b, i) => (i === line ? { ...b, text } : b)),
        line,
      };
    }
    const at = section.end;
    return {
      blocks: insertAt(blocks, at, [
        { type: "item", depth: 0, text: `${label}: ${name}` },
      ]),
      line: at,
    };
  }

  // A line at the end of its section, after the section's last line.
  const at = section.end;
  return {
    blocks: insertAt(blocks, at, [
      { type: "item", depth: 0, text: entryLine(entry, language) },
    ]),
    line: at,
  };
}

/**
 * Moves a competency to a level (a validation's proposal the user
 * accepted): it leaves the line it was on, if any, and joins its level's.
 */
export function setCompetencyLevel(
  input: ProfileBlock[],
  name: string,
  level: CompetencyLevel
): ProfileBlock[] {
  const structure = readStructure(input);
  const section = sectionOf(structure, "competencies");
  const wanted = name.trim().toLowerCase();
  const blocks = input.map((block, line) => {
    if (!section || line < section.start || line >= section.end) return block;
    if (block.type !== "item") return block;
    const labelled = splitLabel(block.text);
    const prefix = labelled
      ? block.text.slice(0, block.text.indexOf(":") + 1)
      : "";
    const value = labelled ? labelled.value : block.text;
    // The same names the extract reads, so the proposal leaves the list.
    const names = splitNames(value, 0, { anyLength: true });
    const found = names.find((n) => n.name.toLowerCase() === wanted);
    if (!found) return block;
    const rest = names
      .filter((n) => n !== found)
      .map((n) => n.name)
      .join(", ");
    return {
      ...block,
      text: prefix ? `${prefix}${rest ? ` ${rest}` : ""}` : rest,
    };
  });
  return insertEntry(blocks, { kind: "competency", name: name.trim(), level })
    .blocks;
}

/**
 * Adds the empty “occasional experience” line right after the “use often”
 * line of a profile written before that level existed. Does nothing when
 * the section has no “use often” line or already has an occasional one.
 */
export function addOccasionalLevelLine(input: ProfileBlock[]): ProfileBlock[] {
  const section = sectionOf(readStructure(input), "competencies");
  if (!section) return input;
  let often = -1;
  for (let line = section.start; line < section.end; line++) {
    const block = input[line];
    if (block.type !== "item" || block.depth) continue;
    const labelled = splitLabel(block.text);
    const level = labelled ? competencyLevelOf(labelled.label) : null;
    if (level === "occasional") return input;
    if (level === "often") often = line;
  }
  if (often < 0) return input;
  const language: ProfileLanguage = input[often].text.startsWith(
    competencyLabels["en-US"].often
  )
    ? "en-US"
    : "pt-BR";
  let at = often + 1;
  while (
    at < section.end &&
    input[at].type === "item" &&
    (input[at] as { depth: number }).depth > 0
  ) {
    at++;
  }
  const line: ProfileBlock = {
    type: "item",
    depth: 0,
    text: `${competencyLabels[language].occasional}:`,
  };
  return [...input.slice(0, at), line, ...input.slice(at)];
}
