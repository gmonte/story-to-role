import type { ProfileBlock } from "./blocks";
import { canonicalMonth, readMonth } from "./dates";
import { canonicalMarkText, findMarks, hasFigure } from "./marks";
import {
  competencyLevelOf,
  normalizeLabel,
  profileSectionKeys,
  type CompetencyLevel,
} from "./sections";
import {
  readLooseTitle,
  readStructure,
  sectionOf,
  splitLabel,
  type ProfileStructure,
} from "./structure";

/**
 * Format findings break what the rest of the product reads and block
 * publishing; content findings point at what the method asks for and never
 * block (profile spec, "The linter").
 */
export type FindingKind = "format" | "content";

export const findingCodes = {
  missingSection: "format",
  sectionOrder: "format",
  experienceTitle: "format",
  dateFormat: "format",
  educationFormat: "format",
  certificationFormat: "format",
  certificationStatus: "format",
  competencyLevel: "format",
  unmarkedFigure: "content",
  markFormat: "content",
  missingNotDone: "content",
  experienceOrder: "content",
  experienceOverlap: "content",
  expiredWithoutDate: "content",
  competencyMissing: "content",
  competencyUnbacked: "content",
  studiedUsed: "content",
  neverInclude: "content",
  // The job preferences document's own.
  workModelUnknown: "content",
} as const satisfies Record<string, FindingKind>;

export type FindingCode = keyof typeof findingCodes;

export type ProfileFinding = {
  code: FindingCode;
  kind: FindingKind;
  // The block the finding is on, and the characters of its text it covers;
  // null for the document as a whole (a missing section).
  line: number | null;
  from: number;
  to: number;
  fixable: boolean;
  params?: Record<string, string>;
};

const fixableCodes = new Set<FindingCode>([
  "missingSection",
  "sectionOrder",
  "dateFormat",
  "certificationStatus",
  "markFormat",
]);

function finding(
  code: FindingCode,
  line: number | null,
  range: { from: number; to: number },
  extra: { fixable?: boolean; params?: Record<string, string> } = {}
): ProfileFinding {
  return {
    code,
    kind: findingCodes[code],
    line,
    from: range.from,
    to: range.to,
    fixable: extra.fixable ?? fixableCodes.has(code),
    ...(extra.params ? { params: extra.params } : {}),
  };
}

function whole(block: ProfileBlock) {
  return { from: 0, to: block.text.length };
}

// A tool or competency is a short name; a longer phrase, or one opening with
// a connecting word, is prose around it.
const maxNameWords = 3;
const proseStarts = new Set([
  "a",
  "o",
  "as",
  "os",
  "com",
  "sem",
  "para",
  "por",
  "pelo",
  "pela",
  "no",
  "na",
  "nos",
  "nas",
  "em",
  "de",
  "do",
  "da",
  "ele",
  "ela",
  "alguns",
  "algumas",
  "um",
  "uma",
  "the",
  "with",
  "without",
  "for",
  "by",
  "in",
  "on",
  "of",
  "some",
  "an",
]);

/**
 * Splits a list of names ("Python, SQL e Docker", "Web: Next.js, Tailwind",
 * "Postgres (Neon; pglite nos testes)") into names with their offsets:
 * separators inside parentheses don't split, a parenthesis and a category
 * prefix aren't part of the name, and long phrases are left out.
 */
export function splitNames(
  text: string,
  offset = 0,
  { anyLength = false }: { anyLength?: boolean } = {}
) {
  const parts: Array<{ text: string; start: number }> = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    const char = text[i];
    if (char === "(" || char === "[") depth++;
    else if ((char === ")" || char === "]") && depth) depth--;
    else if (i === text.length || (!depth && (char === "," || char === ";"))) {
      parts.push({ text: text.slice(start, i), start });
      start = i + 1;
    }
  }

  const names: Array<{ name: string; from: number; to: number }> = [];
  for (const part of parts) {
    let cursor = part.start;
    for (const piece of part.text.split(/\s+(?:e|and)\s+/)) {
      const at = text.indexOf(piece, cursor);
      cursor = at + piece.length;
      let name = piece.replace(/\s*[([].*$/, "");
      const colon = name.lastIndexOf(":");
      if (colon >= 0) name = name.slice(colon + 1);
      name = name
        .trim()
        .replace(/[.)\]]+$/, "")
        .trim();
      const words = name.split(/\s+/);
      if (!name) continue;
      if (!anyLength && words.length > maxNameWords) continue;
      if (!anyLength && proseStarts.has(words[0].toLowerCase())) continue;
      const from = offset + at + piece.indexOf(name);
      names.push({ name, from, to: from + name.length });
    }
  }
  return names;
}

const separator = /\s+—\s+/;

function lintSections(structure: ProfileStructure, blocks: ProfileBlock[]) {
  const findings: ProfileFinding[] = [];
  const present = structure.sections.filter((s) => s.key);
  for (const key of profileSectionKeys) {
    if (key === "addenda") continue;
    if (!present.some((section) => section.key === key)) {
      findings.push(
        finding(
          "missingSection",
          null,
          { from: 0, to: 0 },
          {
            params: { section: key },
          }
        )
      );
    }
  }
  let last = -1;
  for (const section of present) {
    const order = profileSectionKeys.indexOf(section.key!);
    if (order < last) {
      findings.push(
        finding(
          "sectionOrder",
          section.heading,
          whole(blocks[section.heading]),
          {
            params: { section: section.key as string },
          }
        )
      );
    } else {
      last = order;
    }
  }
  return findings;
}

function lintExperiences(structure: ProfileStructure, blocks: ProfileBlock[]) {
  const findings: ProfileFinding[] = [];
  let previous: { start: string; end: string } | null = null;
  for (const experience of structure.experiences) {
    const heading = blocks[experience.heading];
    if (!experience.parsed) {
      findings.push(
        finding("experienceTitle", experience.heading, whole(heading), {
          fixable: !!readLooseTitle(experience.rawTitle),
        })
      );
    }

    const notDone = experience.fields.notDone;
    if (!notDone || (!notDone.value && !notDone.children.length)) {
      findings.push(
        finding(
          "missingNotDone",
          notDone?.line ?? experience.heading,
          whole(blocks[notDone?.line ?? experience.heading])
        )
      );
    }

    const results = experience.fields.results;
    if (results) {
      const lines = [results.line, ...results.children];
      for (const line of lines) {
        const text = blocks[line].text;
        if (hasFigure(text) && !findMarks(text).length) {
          findings.push(finding("unmarkedFigure", line, whole(blocks[line])));
        }
      }
    }

    if (experience.parsed) {
      const { start, end } = experience.parsed.range;
      const current = { start, end: end === "present" ? "9999-12" : end };
      if (previous) {
        if (current.start > previous.start) {
          findings.push(
            finding("experienceOrder", experience.heading, whole(heading))
          );
        } else if (current.end > previous.start) {
          findings.push(
            finding("experienceOverlap", experience.heading, whole(heading))
          );
        }
      }
      previous = current;
    }
  }
  return findings;
}

/** Every mark not written the canonical way, anywhere in the document. */
function lintMarks(structure: ProfileStructure, blocks: ProfileBlock[]) {
  const findings: ProfileFinding[] = [];
  blocks.forEach((block, line) => {
    for (const match of findMarks(block.text)) {
      if (match.text !== canonicalMarkText(match, structure.language)) {
        findings.push(finding("markFormat", line, match));
      }
    }
  });
  return findings;
}

const educationStatus =
  /^(?:conclu[ií]d[oa]|completed)(?:\s+(?:em|in)\s+(\S+))?$|^(?:em andamento até|em andamento ate|in progress until)\s+(\S+)$/i;

const certificationStatus =
  /^(?:v[aá]lida|valid|em renova[cç][aã]o|renewing)$|^(?:expirada|expired)(?:\s+(?:em|in)\s+(\S+))?$/i;

/** The date's offset in the line, for a finding on just the date. */
function dateFinding(line: number, text: string, date: string) {
  const from = text.lastIndexOf(date);
  return finding(
    "dateFormat",
    line,
    { from, to: from + date.length },
    {
      fixable: !!readMonth(date),
    }
  );
}

function lintCredentials(structure: ProfileStructure, blocks: ProfileBlock[]) {
  const findings: ProfileFinding[] = [];
  const education = sectionOf(structure, "education");
  for (
    let line = education?.start ?? 0;
    education && line < education.end;
    line++
  ) {
    const block = blocks[line];
    if (block.type !== "item" || block.depth) continue;
    const parts = block.text.split(separator);
    const status = educationStatus.exec(parts[2]?.trim() ?? "");
    if (parts.length !== 3 || !status) {
      findings.push(finding("educationFormat", line, whole(block)));
      continue;
    }
    const date = status[1] ?? status[2];
    if (date && !canonicalMonth.test(date) && !/^\d{4}$/.test(date)) {
      findings.push(dateFinding(line, block.text, date));
    }
  }

  const certifications = sectionOf(structure, "certifications");
  for (
    let line = certifications?.start ?? 0;
    certifications && line < certifications.end;
    line++
  ) {
    const block = blocks[line];
    if (block.type !== "item" || block.depth) continue;
    const parts = block.text.split(separator);
    if (parts.length === 3) {
      findings.push(finding("certificationStatus", line, whole(block)));
      continue;
    }
    if (parts.length !== 4) {
      findings.push(finding("certificationFormat", line, whole(block)));
      continue;
    }
    const status = certificationStatus.exec(parts[3].trim());
    if (!status) {
      // A status to fill (Fix format leaves a blank) or one we don't know.
      const from = block.text.lastIndexOf(parts[3]);
      findings.push(
        finding(
          "certificationStatus",
          line,
          { from, to: block.text.length },
          {
            fixable: false,
          }
        )
      );
      continue;
    }
    const issued = parts[2].trim();
    if (!canonicalMonth.test(issued) && !/^\d{4}$/.test(issued)) {
      findings.push(
        dateFinding(
          line,
          block.text.slice(0, block.text.lastIndexOf(parts[3])),
          issued
        )
      );
    }
    if (/^(expirada|expired)/i.test(parts[3].trim())) {
      if (!status[1]) {
        findings.push(finding("expiredWithoutDate", line, whole(block)));
      } else if (!canonicalMonth.test(status[1])) {
        findings.push(dateFinding(line, block.text, status[1]));
      }
    }
  }
  return findings;
}

type Competency = {
  name: string;
  // Null for a name on a line without a level.
  level: CompetencyLevel | null;
  line: number;
  from: number;
  to: number;
};

function readCompetencies(structure: ProfileStructure, blocks: ProfileBlock[]) {
  const findings: ProfileFinding[] = [];
  const competencies: Competency[] = [];
  const section = sectionOf(structure, "competencies");
  // Items under a level's line belong to that level; a line without a level
  // is a format finding, but its names still count as known competencies.
  let level: CompetencyLevel | null = null;
  for (let line = section?.start ?? 0; section && line < section.end; line++) {
    const block = blocks[line];
    if (block.type !== "item") continue;
    const labelled = splitLabel(block.text);
    if (!block.depth) {
      level = labelled ? competencyLevelOf(labelled.label) : null;
      if (!level) findings.push(finding("competencyLevel", line, whole(block)));
    }
    const value =
      labelled && competencyLevelOf(labelled.label) ? labelled : null;
    const names = value
      ? splitNames(value.value, value.valueStart)
      : splitNames(labelled?.value ?? block.text, labelled?.valueStart ?? 0);
    for (const name of names) {
      competencies.push({ ...name, level, line });
    }
  }
  return { findings, competencies };
}

function foldCase(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeName(name: string) {
  return normalizeLabel(name).replace(/\s+/g, " ");
}

/** Whether `text` names `name` as a whole word, whatever case or accents. */
export function mentions(text: string, name: string) {
  const escaped = normalizeName(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`,
    "u"
  ).test(normalizeName(text));
}

function lintCompetencies(structure: ProfileStructure, blocks: ProfileBlock[]) {
  const { findings, competencies } = readCompetencies(structure, blocks);
  if (!sectionOf(structure, "competencies")) return findings;
  const known = new Map(competencies.map((c) => [normalizeName(c.name), c]));
  const competencySection = sectionOf(structure, "competencies");
  const competencyText = competencySection
    ? blocks
        .slice(competencySection.start, competencySection.end)
        .map((block) => block.text)
        .join("\n")
    : "";

  const reported = new Set<string>();
  for (const experience of structure.experiences) {
    const tools = experience.fields.tools;
    if (!tools) continue;
    const block = blocks[tools.line];
    const labelled = splitLabel(block.text);
    const names = [
      ...splitNames(tools.value, labelled?.valueStart ?? 0).map((n) => ({
        ...n,
        line: tools.line,
      })),
      ...tools.children.flatMap((line) =>
        splitNames(blocks[line].text).map((n) => ({ ...n, line }))
      ),
    ];
    for (const tool of names) {
      // Each missing name is marked once, where it first appears.
      if (reported.has(normalizeName(tool.name))) continue;
      const competency = known.get(normalizeName(tool.name));
      if (!competency && !mentions(competencyText, tool.name)) {
        reported.add(normalizeName(tool.name));
        findings.push(
          finding("competencyMissing", tool.line, tool, {
            params: { name: tool.name },
          })
        );
      } else if (competency?.level === "studied") {
        findings.push(
          finding("studiedUsed", tool.line, tool, {
            params: { name: tool.name },
          })
        );
      }
    }
  }

  const experienceSection = sectionOf(structure, "experience");
  const experienceText = experienceSection
    ? blocks
        .slice(experienceSection.start, experienceSection.end)
        .map((block) => block.text)
        .join("\n")
    : "";
  for (const competency of competencies) {
    if (competency.level !== "master" && competency.level !== "often") continue;
    if (!mentions(experienceText, competency.name)) {
      findings.push(
        finding("competencyUnbacked", competency.line, competency, {
          params: { name: competency.name },
        })
      );
    }
  }
  return findings;
}

const neverIncludeLabels = ["nunca incluir", "never include"];

function lintNeverInclude(structure: ProfileStructure, blocks: ProfileBlock[]) {
  const findings: ProfileFinding[] = [];
  const rules = sectionOf(structure, "rules");
  if (!rules) return findings;
  const terms: string[] = [];
  for (let line = rules.start; line < rules.end; line++) {
    const labelled = splitLabel(blocks[line].text);
    if (
      labelled &&
      neverIncludeLabels.includes(normalizeLabel(labelled.label))
    ) {
      terms.push(
        ...splitNames(labelled.value, 0, { anyLength: true }).map((n) => n.name)
      );
    }
  }
  blocks.forEach((block, line) => {
    if (line >= rules.heading && line < rules.end) return;
    // Same length as the text (accents dropped one for one), so offsets hold.
    const text = foldCase(block.text);
    for (const term of terms) {
      const index = text.indexOf(foldCase(term));
      if (index >= 0 && mentions(block.text, term)) {
        findings.push(
          finding(
            "neverInclude",
            line,
            { from: index, to: index + term.length },
            { params: { term } }
          )
        );
      }
    }
  });
  return findings;
}

/**
 * The deterministic check of the profile (profile spec, "The linter"), the
 * same in the browser as the user types and on the server when the draft is
 * saved or published.
 */
export function lintProfile(blocks: ProfileBlock[]): ProfileFinding[] {
  const structure = readStructure(blocks);
  return [
    ...lintSections(structure, blocks),
    ...lintExperiences(structure, blocks),
    ...lintMarks(structure, blocks),
    ...lintCredentials(structure, blocks),
    ...lintCompetencies(structure, blocks),
    ...lintNeverInclude(structure, blocks),
  ].sort((a, b) => (a.line ?? -1) - (b.line ?? -1) || a.from - b.from);
}

export function hasFormatErrors(findings: ProfileFinding[]) {
  return findings.some((f) => f.kind === "format");
}
