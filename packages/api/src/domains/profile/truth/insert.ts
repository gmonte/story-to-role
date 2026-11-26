import type { ProfileBlock } from "./blocks";
import type { DateRange } from "./dates";
import {
  competencyLabels,
  competencyLevelOf,
  normalizeLabel,
  profileSectionKeys,
  type CompetencyLevel,
  type ProfileLanguage,
  type ProfileSectionKey,
  translationLanguageOf,
  translationLineLabels,
} from "./sections";
import { publicNamesLabels } from "../rules/public-names";
import { splitNames } from "./lint";
import { readStructure, sectionOf, splitLabel } from "./structure";
import {
  experienceTemplate,
  projectTemplate,
  sectionTemplate,
} from "./template";

/** What the insert menu adds (profile spec, "The editor"). */
export type ProfileEntry =
  | { kind: "experience"; company: string; title: string; range: DateRange }
  // Personal or side work that is not a position (profile spec).
  | { kind: "project"; name: string; role?: string | null; range: DateRange }
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
  | { kind: "rule"; rule: "neverInclude" | "neverClaim"; text: string }
  // An entry of the public names dictionary: the real name, its public form.
  | { kind: "rule"; rule: "publicName"; original: string; public: string }
  // An entry of the translations dictionary for one target language: a
  // code-printed field as the profile writes it, and how documents in that
  // language write it.
  | {
      kind: "rule";
      rule: "translation";
      language: ProfileLanguage;
      original: string;
      translation: string;
    };

export type ProfileEntryKind = ProfileEntry["kind"];

const sectionOfEntry: Record<ProfileEntryKind, ProfileSectionKey> = {
  experience: "experience",
  project: "projects",
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
    publicName: string;
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
    publicName: "Nomes públicos",
  },
  "en-US": {
    completed: "completed",
    inProgressUntil: "in progress until",
    valid: "valid",
    expiredOn: "expired in",
    renewing: "renewing",
    neverInclude: "Never include",
    neverClaim: "Never claim",
    publicName: "Public names",
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

  if (entry.kind === "experience" || entry.kind === "project") {
    const end = entry.range.end === "present" ? "9999-12" : entry.range.end;
    // Before the first entry that started earlier (or ended earlier).
    const entries: Array<{
      heading: number;
      parsed: { range: DateRange } | null;
    }> =
      entry.kind === "experience" ? structure.experiences : structure.projects;
    const before = entries.find((other) => {
      if (!other.parsed) return false;
      const range = other.parsed.range;
      const otherEnd = range.end === "present" ? "9999-12" : range.end;
      return (
        range.start < entry.range.start ||
        (range.start === entry.range.start && otherEnd < end)
      );
    });
    const at = before?.heading ?? section.end;
    return {
      blocks: insertAt(
        blocks,
        at,
        entry.kind === "experience"
          ? experienceTemplate(entry, language)
          : projectTemplate(entry, language)
      ),
      line: at,
    };
  }

  if (
    entry.kind === "rule" &&
    (entry.rule === "publicName" || entry.rule === "translation")
  ) {
    // A dictionary line (public names, or the translations into one
    // language): the entry joins the line's own `;` list or its sub-items.
    const pair =
      entry.rule === "publicName"
        ? `${entry.original.trim()} → ${entry.public.trim()}`
        : `${entry.original.trim()} → ${entry.translation.trim()}`;
    const isLine = (label: string) =>
      entry.rule === "publicName"
        ? publicNamesLabels.includes(normalizeLabel(label))
        : translationLanguageOf(label) === entry.language;
    const lineLabel =
      entry.rule === "publicName"
        ? words[language].publicName
        : translationLineLabels[language][entry.language];
    for (let line = section.start; line < section.end; line++) {
      const block = blocks[line];
      if (block.type !== "item" || block.depth) continue;
      const labelled = splitLabel(block.text);
      if (!labelled || !isLine(labelled.label)) continue;
      // Written on the line itself: one more “; ” entry.
      const value = labelled.value.trim().replace(/[.;]$/, "");
      if (value) {
        const text = `${block.text.slice(0, block.text.indexOf(":") + 1)} ${value}; ${pair}`;
        return {
          blocks: blocks.map((b, i) => (i === line ? { ...b, text } : b)),
          line,
        };
      }
      // Listed under it: one more sub-item, after the others.
      let at = line + 1;
      while (
        at < section.end &&
        blocks[at].type === "item" &&
        (blocks[at] as { depth: number }).depth > 0
      ) {
        at++;
      }
      return {
        blocks: insertAt(blocks, at, [{ type: "item", depth: 1, text: pair }]),
        line: at,
      };
    }
    const at = section.end;
    return {
      blocks: insertAt(blocks, at, [
        { type: "item", depth: 0, text: `${lineLabel}:` },
        { type: "item", depth: 1, text: pair },
      ]),
      line: at + 1,
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
 * The competency names a proposed name stands for, as the extract reads
 * them back from a level's line: “Kubernetes (EKS)” is Kubernetes, “CI/CD
 * e GitOps” two names, and a phrase too long for a name is none.
 */
export const competencyNames = (name: string) =>
  splitNames(name).map((found) => found.name);

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
