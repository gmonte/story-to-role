import type { ProfileBlock } from "../truth/blocks";
import { mentions, type ProfileFinding } from "../truth/lint";
import { normalizeLabel, type ProfileLanguage } from "../truth/sections";
import { splitLabel } from "../truth/structure";

/**
 * The job preferences document (profile spec, "Job preferences"): what the
 * user accepts and what they never want recommended. Only screening reads
 * it; generation never does.
 */
export const preferenceSectionKeys = [
  "workModel",
  "locations",
  "salary",
  "excludedCompanies",
  "excludedSectors",
  "discardRules",
] as const;
export type PreferenceSectionKey = (typeof preferenceSectionKeys)[number];

export const workModels = ["remote", "hybrid", "onsite"] as const;
export type WorkModel = (typeof workModels)[number];

const aliases: Record<PreferenceSectionKey, string[]> = {
  workModel: ["modelo de trabalho", "work model"],
  locations: ["locais aceitos", "locais", "accepted locations", "locations"],
  salary: ["faixa salarial", "salario", "salary range", "salary"],
  excludedCompanies: ["empresas excluidas", "excluded companies"],
  excludedSectors: ["setores excluidos", "excluded sectors"],
  discardRules: ["regras de descarte", "discard rules"],
};

const englishAliases = new Set([
  "work model",
  "accepted locations",
  "locations",
  "salary range",
  "salary",
  "excluded companies",
  "excluded sectors",
  "discard rules",
]);

export const preferenceHeadings: Record<
  ProfileLanguage,
  Record<PreferenceSectionKey, string>
> = {
  "pt-BR": {
    workModel: "Modelo de trabalho",
    locations: "Locais aceitos",
    salary: "Faixa salarial",
    excludedCompanies: "Empresas excluídas",
    excludedSectors: "Setores excluídos",
    discardRules: "Regras de descarte",
  },
  "en-US": {
    workModel: "Work model",
    locations: "Accepted locations",
    salary: "Salary range",
    excludedCompanies: "Excluded companies",
    excludedSectors: "Excluded sectors",
    discardRules: "Discard rules",
  },
};

const template: Record<
  ProfileLanguage,
  {
    title: string;
    quote: string[];
    items: Partial<Record<PreferenceSectionKey, string[]>>;
  }
> = {
  "pt-BR": {
    title: "Preferências de vaga",
    quote: [
      "Só a triagem de vagas lê este documento. Nada daqui entra em currículo ou carta.",
      "Os motivos são só para mim.",
    ],
    items: {
      workModel: ["Aceito: remoto, híbrido, presencial"],
      salary: ["Mínimo:", "Desejado:"],
    },
  },
  "en-US": {
    title: "Job preferences",
    quote: [
      "Only the screening of openings reads this document. Nothing here reaches a resume or a letter.",
      "The reasons are for me only.",
    ],
    items: {
      workModel: ["I accept: remote, hybrid, on site"],
      salary: ["Minimum:", "Target:"],
    },
  },
};

/** A new job preferences document, in the interface language. */
export function preferencesTemplate(language: ProfileLanguage): ProfileBlock[] {
  const { title, quote, items } = template[language];
  return [
    { type: "heading", level: 1, text: title },
    ...quote.map((text) => ({ type: "quote" as const, text })),
    ...preferenceSectionKeys.flatMap((key): ProfileBlock[] => [
      { type: "heading", level: 2, text: preferenceHeadings[language][key] },
      ...(items[key] ?? []).map((text) => ({
        type: "item" as const,
        depth: 0,
        text,
      })),
    ]),
  ];
}

type PreferenceSection = {
  key: PreferenceSectionKey | null;
  heading: number;
  start: number;
  end: number;
};

function sectionKeyOf(headingText: string): PreferenceSectionKey | null {
  const label = normalizeLabel(headingText);
  return (
    preferenceSectionKeys.find((key) => aliases[key].includes(label)) ?? null
  );
}

export function readPreferenceSections(blocks: ProfileBlock[]) {
  const sections: PreferenceSection[] = [];
  blocks.forEach((block, index) => {
    if (block.type !== "heading" || block.level !== 2) return;
    sections.push({
      key: sectionKeyOf(block.text),
      heading: index,
      start: index + 1,
      end: blocks.length,
    });
  });
  sections.forEach((section, index) => {
    section.end = sections[index + 1]?.heading ?? blocks.length;
  });
  const english = sections.filter((section) =>
    englishAliases.has(normalizeLabel(blocks[section.heading].text))
  ).length;
  const language: ProfileLanguage =
    english > sections.filter((section) => section.key).length - english
      ? "en-US"
      : "pt-BR";
  return { sections, language };
}

const workModelWords: Record<WorkModel, string[]> = {
  remote: ["remoto", "remota", "remote", "home office"],
  hybrid: ["hibrido", "hibrida", "hybrid"],
  onsite: ["presencial", "on site", "onsite", "on-site", "in person"],
};

const refusal =
  /(^|\s)(nao|not|don't|dont|never|nunca|except|exceto|menos)(\s|$)/;

/** What screening reads from the published preferences. */
export type PreferencesExtract = {
  // Empty when the document doesn't say: nothing is assumed.
  workModels: WorkModel[];
  locations: string[];
  salary: string[];
  excludedCompanies: string[];
  excludedSectors: string[];
  discardRules: string[];
};

function items(blocks: ProfileBlock[], section: PreferenceSection | undefined) {
  if (!section) return [];
  return blocks
    .slice(section.start, section.end)
    .filter((block) => block.type !== "heading")
    .map((block) => block.text.trim())
    .filter(Boolean);
}

/** A company's name in its line: "Acme (2026-11-17): reason" is Acme. */
function nameOf(line: string) {
  return (
    line
      .replace(/\s*\(\d{4}-\d{2}(-\d{2})?\).*$/, "")
      // A reason follows a colon and a space; "Re:amaze" is a name.
      .replace(/\s*:\s.*$/, "")
      .replace(/:$/, "")
      .trim()
  );
}

export function extractPreferences(blocks: ProfileBlock[]): PreferencesExtract {
  const { sections } = readPreferenceSections(blocks);
  const of = (key: PreferenceSectionKey) =>
    items(
      blocks,
      sections.find((section) => section.key === key)
    );
  // What a clause refuses ("I do not accept on site") is not accepted.
  const accepted = normalizeLabel(
    of("workModel")
      .map((line) => splitLabel(line)?.value ?? line)
      .flatMap((line) => line.split(/[.;]/))
      .filter((clause) => !refusal.test(normalizeLabel(clause)))
      .join(", ")
  );
  return {
    workModels: workModels.filter((model) =>
      workModelWords[model].some((word) => accepted.includes(word))
    ),
    locations: of("locations"),
    // A label with nothing after it says nothing.
    salary: of("salary").filter((line) => !/:\s*$/.test(line)),
    excludedCompanies: of("excludedCompanies").map(nameOf).filter(Boolean),
    excludedSectors: of("excludedSectors"),
    discardRules: of("discardRules"),
  };
}

/**
 * The preferences an opening can break, each as the user wrote it, for
 * screening to check one by one. Excluded companies are left out: code
 * compares their names.
 */
export function preferenceRules(blocks: ProfileBlock[]) {
  const { sections } = readPreferenceSections(blocks);
  return sections.flatMap((section) =>
    !section.key || section.key === "excludedCompanies"
      ? []
      : items(blocks, section)
          // A label with nothing after it says nothing.
          .filter((line) => !/:\s*$/.test(line))
          .map((text) => ({ section: section.key!, text }))
  );
}

/**
 * The deterministic check of the preferences: its sections present and in
 * order (format, which blocks publishing, since screening reads them by
 * name) and a work model it can read (content).
 */
export function lintPreferences(blocks: ProfileBlock[]): ProfileFinding[] {
  const { sections, language } = readPreferenceSections(blocks);
  const findings: ProfileFinding[] = [];
  for (const key of preferenceSectionKeys) {
    if (!sections.some((section) => section.key === key)) {
      findings.push({
        code: "missingSection",
        kind: "format",
        line: null,
        from: 0,
        to: 0,
        fixable: true,
        params: { section: key, title: preferenceHeadings[language][key] },
      });
    }
  }
  let last = -1;
  for (const section of sections) {
    if (!section.key) continue;
    const order = preferenceSectionKeys.indexOf(section.key);
    if (order < last) {
      findings.push({
        code: "sectionOrder",
        kind: "format",
        line: section.heading,
        from: 0,
        to: blocks[section.heading].text.length,
        fixable: true,
        params: {
          section: section.key,
          title: preferenceHeadings[language][section.key],
        },
      });
    } else {
      last = order;
    }
  }
  const workModel = sections.find((section) => section.key === "workModel");
  if (workModel && !extractPreferences(blocks).workModels.length) {
    findings.push({
      code: "workModelUnknown",
      kind: "content",
      line: workModel.heading,
      from: 0,
      to: blocks[workModel.heading].text.length,
      fixable: false,
    });
  }
  return findings.sort(
    (a, b) => (a.line ?? -1) - (b.line ?? -1) || a.from - b.from
  );
}

/** Fix format: missing sections inserted, sections back in order. */
export function fixPreferencesFormat(blocks: ProfileBlock[]): ProfileBlock[] {
  const { sections, language } = readPreferenceSections(blocks);
  const head = blocks.slice(0, sections[0]?.heading ?? blocks.length);
  const chunks = sections.map((section, index) => ({
    key: section.key,
    index,
    blocks: blocks.slice(section.heading, section.end),
  }));
  for (const key of preferenceSectionKeys) {
    if (chunks.some((chunk) => chunk.key === key)) continue;
    chunks.push({
      key,
      index: chunks.length,
      blocks: [
        { type: "heading", level: 2, text: preferenceHeadings[language][key] },
        ...(template[language].items[key] ?? []).map((text) => ({
          type: "item" as const,
          depth: 0,
          text,
        })),
      ],
    });
  }
  // Sections it doesn't know keep their place after the one they follow.
  let lastOrder = -1;
  const ranked = chunks.map((chunk) => {
    if (chunk.key) lastOrder = preferenceSectionKeys.indexOf(chunk.key);
    return { ...chunk, order: lastOrder + (chunk.key ? 0 : 0.5) };
  });
  ranked.sort((a, b) => a.order - b.order || a.index - b.index);
  return [...head, ...ranked.flatMap((chunk) => chunk.blocks)];
}

/**
 * Adds a line to one of the preferences' sections (creating the section
 * when it's missing): an excluded company with the day it was excluded, a
 * discard rule, a location. Nothing is added twice.
 */
export function addPreference(
  input: ProfileBlock[],
  entry:
    | { section: "excludedCompanies"; company: string; date: string }
    | {
        section: "excludedSectors" | "discardRules" | "locations";
        text: string;
      }
): ProfileBlock[] {
  const blocks = lintPreferences(input).some(
    (finding) =>
      finding.code === "missingSection" &&
      finding.params?.section === entry.section
  )
    ? fixPreferencesFormat(input)
    : input;
  const { sections } = readPreferenceSections(blocks);
  const section = sections.find((s) => s.key === entry.section)!;
  const existing = items(blocks, section);
  const text =
    entry.section === "excludedCompanies"
      ? `${entry.company.trim()} (${entry.date})`
      : entry.text.trim();
  const name = normalizeLabel(
    entry.section === "excludedCompanies" ? entry.company : entry.text
  );
  const already = existing.some((line) =>
    entry.section === "excludedCompanies"
      ? normalizeLabel(nameOf(line)) === name
      : normalizeLabel(line) === name
  );
  if (already || !name) return blocks;
  return [
    ...blocks.slice(0, section.end),
    { type: "item", depth: 0, text },
    ...blocks.slice(section.end),
  ];
}

/**
 * The excluded company an opening's company is, if any: the same name, or
 * one naming the other as whole words ("Initech" for "Initech Tecnologia"),
 * never a part of a word ("Meta" is not "Metabase").
 */
export function isExcludedCompany(
  preferences: PreferencesExtract,
  company: string | null
) {
  if (!normalizeLabel(company ?? "")) return null;
  return (
    preferences.excludedCompanies.find(
      (excluded) => mentions(company!, excluded) || mentions(excluded, company!)
    ) ?? null
  );
}
