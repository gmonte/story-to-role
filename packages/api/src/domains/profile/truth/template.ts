import type { ProfileBlock } from "./blocks";
import type { DateRange } from "./dates";
import {
  competencyLabels,
  dateWords,
  experienceFieldLabels,
  sectionHeadings,
  type ProfileLanguage,
  type ProfileSectionKey,
} from "./sections";

const intro: Record<ProfileLanguage, { title: string; quote: string[] }> = {
  "pt-BR": {
    title: "Perfil",
    quote: [
      "Fonte única de fatos sobre a minha carreira. Nada daqui sai sem eu aprovar.",
      "Marque números com [medido], [estimado] ou [sem número].",
    ],
  },
  "en-US": {
    title: "Profile",
    quote: [
      "The one source of facts about my career. Nothing leaves it without my approval.",
      "Mark figures with [measured], [estimated] or [no number].",
    ],
  },
};

const sectionItems: Record<
  ProfileLanguage,
  Partial<Record<ProfileSectionKey, string[]>>
> = {
  "pt-BR": {
    identity: [
      "Nome profissional:",
      "Senioridade e áreas:",
      "Direção de carreira (o que busco):",
    ],
    contact: [
      "E-mail profissional:",
      "Telefone:",
      "Cidade e UF:",
      "LinkedIn:",
      "Site ou portfólio:",
    ],
    rules: [
      "Nunca incluir: documentos de identidade, dados bancários, dados pessoais fora da seção Contato, informações confidenciais de empregadores; nomes de pessoas; motivos de saída, demissões e opiniões sobre ex-empregadores; valores de salário e faturamento; detalhes de vulnerabilidades; nomes internos de repositórios e projetos.",
      "Nunca afirmar: números que não estejam marcados como [medido] ou [estimado].",
      "Nomes públicos:",
    ],
  },
  "en-US": {
    identity: [
      "Professional name:",
      "Seniority and areas:",
      "Career direction (what I look for):",
    ],
    contact: [
      "Professional email:",
      "Phone:",
      "City and state:",
      "LinkedIn:",
      "Website or portfolio:",
    ],
    rules: [
      "Never include: identity documents, bank details, personal data outside the Contact section, employers' confidential information; names of people; reasons for leaving, layoffs and opinions about former employers; salary and revenue figures; vulnerability details; internal names of repositories and projects.",
      "Never claim: figures not marked [measured] or [estimated].",
      "Public names:",
    ],
  },
};

/** A section's heading and its starting lines, as a new profile has them. */
export function sectionTemplate(
  key: ProfileSectionKey,
  language: ProfileLanguage
): ProfileBlock[] {
  const items =
    key === "competencies"
      ? Object.values(competencyLabels[language]).map((label) => `${label}:`)
      : (sectionItems[language][key] ?? []);
  return [
    { type: "heading", level: 2, text: sectionHeadings[language][key] },
    ...items.map((text) => ({ type: "item" as const, depth: 0, text })),
  ];
}

/** A new profile: the method's template, in the interface language. */
export function profileTemplate(language: ProfileLanguage): ProfileBlock[] {
  const { title, quote } = intro[language];
  return [
    { type: "heading", level: 1, text: title },
    ...quote.map((text) => ({ type: "quote" as const, text })),
    ...(Object.keys(sectionHeadings[language]) as ProfileSectionKey[])
      // Addenda is no longer read: a new profile doesn't have it.
      .filter((key) => key !== "addenda")
      .flatMap((key) => sectionTemplate(key, language)),
  ];
}

export function formatRange(range: DateRange, language: ProfileLanguage) {
  const words = dateWords[language];
  const end = range.end === "present" ? words.present : range.end;
  return `${range.start} ${words.to} ${end}`;
}

export function experienceTitle(
  entry: { company: string; title: string; range: DateRange },
  language: ProfileLanguage
) {
  return `${entry.company} — ${entry.title} (${formatRange(entry.range, language)})`;
}

/** A new experience: its title and the template's labelled lines. */
export function experienceTemplate(
  entry: { company: string; title: string; range: DateRange },
  language: ProfileLanguage
): ProfileBlock[] {
  return [
    { type: "heading", level: 3, text: experienceTitle(entry, language) },
    ...Object.values(experienceFieldLabels[language]).map((label) => ({
      type: "item" as const,
      depth: 0,
      text: `${label}:`,
    })),
  ];
}
