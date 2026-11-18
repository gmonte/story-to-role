/**
 * The method's sections, in the template's order, with the names they are
 * recognized by in English and Brazilian Portuguese. A heading matches when
 * its text, lowercased, without accents and without a trailing parenthesis,
 * equals one of the aliases.
 */
export const profileSectionKeys = [
  "identity",
  "contact",
  "experience",
  "projects",
  "education",
  "certifications",
  "competencies",
  "languages",
  "gaps",
  "rules",
  "addenda",
] as const;

export type ProfileSectionKey = (typeof profileSectionKeys)[number];

export type ProfileLanguage = "pt-BR" | "en-US";

/** Each language's name, for telling a model which one to write in. */
export const languageNames: Record<ProfileLanguage, string> = {
  "pt-BR": "Brazilian Portuguese",
  "en-US": "English",
};

/**
 * The translations lines of Communication rules (profile spec): under the
 * rules, one optional line per target language, written in the profile's
 * language (“Em inglês:” in a Portuguese profile, “In Portuguese:” in an
 * English one), whose entries (`original → translation`) tell documents in
 * that language how to write a code-printed field.
 */
export const translationLineLabels: Record<
  ProfileLanguage,
  Record<ProfileLanguage, string>
> = {
  "pt-BR": { "en-US": "Em inglês", "pt-BR": "Em português" },
  "en-US": { "en-US": "In English", "pt-BR": "In Portuguese" },
};

const translationAliases: Record<ProfileLanguage, string[]> = {
  "en-US": ["em ingles", "in english", "ingles", "english", "en-us", "en"],
  "pt-BR": [
    "em portugues",
    "em portugues do brasil",
    "in portuguese",
    "in brazilian portuguese",
    "portugues",
    "portuguese",
    "pt-br",
    "pt",
  ],
};

/** The target language a translations line's label names, if any. */
export function translationLanguageOf(label: string): ProfileLanguage | null {
  const normalized = normalizeLabel(label);
  for (const language of Object.keys(translationAliases) as ProfileLanguage[]) {
    if (translationAliases[language].includes(normalized)) return language;
  }
  return null;
}

const aliases: Record<ProfileSectionKey, string[]> = {
  identity: ["identidade profissional", "professional identity", "identity"],
  contact: ["contato", "contact"],
  experience: [
    "experiencia",
    "experiencias",
    "experiencia profissional",
    "experience",
    "professional experience",
    "work experience",
  ],
  projects: [
    "projetos",
    "projetos pessoais",
    "projetos paralelos",
    "projects",
    "personal projects",
    "side projects",
  ],
  education: ["formacao", "formacao academica", "education"],
  certifications: ["certificacoes", "certificados", "certifications"],
  competencies: ["competencias", "habilidades", "competencies", "skills"],
  languages: ["idiomas", "languages"],
  gaps: ["lacunas conhecidas", "lacunas", "known gaps", "gaps"],
  rules: ["regras de comunicacao", "communication rules"],
  addenda: ["adendos", "addenda", "addendum"],
};

export function normalizeLabel(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(.*\)\s*$/, "")
    .replace(/[:.]+\s*$/, "")
    .trim();
}

export function sectionKeyOf(headingText: string): ProfileSectionKey | null {
  const label = normalizeLabel(headingText);
  for (const key of profileSectionKeys) {
    if (aliases[key].includes(label)) return key;
  }
  return null;
}

/** The section headings a new profile, or Fix format, writes. */
export const sectionHeadings: Record<
  ProfileLanguage,
  Record<ProfileSectionKey, string>
> = {
  "pt-BR": {
    identity: "Identidade profissional",
    contact: "Contato (só o que pode aparecer no currículo)",
    experience: "Experiência (mais recente primeiro)",
    projects: "Projetos",
    education: "Formação",
    certifications: "Certificações",
    competencies: "Competências",
    languages: "Idiomas",
    gaps: "Lacunas conhecidas",
    rules: "Regras de comunicação",
    addenda: "Adendos (detalhes lembrados depois)",
  },
  "en-US": {
    identity: "Professional identity",
    contact: "Contact (only what may appear on a resume)",
    experience: "Experience (most recent first)",
    projects: "Projects",
    education: "Education",
    certifications: "Certifications",
    competencies: "Competencies",
    languages: "Languages",
    gaps: "Known gaps",
    rules: "Communication rules",
    addenda: "Addenda (details remembered later)",
  },
};

/** The four competency levels, as the lines under Competencies start. */
export const competencyLevels = [
  "master",
  "often",
  "occasional",
  "studied",
] as const;
export type CompetencyLevel = (typeof competencyLevels)[number];

export const competencyLabels: Record<
  ProfileLanguage,
  Record<CompetencyLevel, string>
> = {
  "pt-BR": {
    master: "Domino",
    often: "Uso com frequência",
    occasional: "Experiência pontual",
    studied: "Estudei, sem experiência profissional",
  },
  "en-US": {
    master: "I master",
    often: "I use often",
    occasional: "Occasional experience",
    studied: "Studied, without professional experience",
  },
};

const competencyAliases: Record<CompetencyLevel, string[]> = {
  master: ["domino", "i master", "master", "expert"],
  often: ["uso com frequencia", "i use often", "use often", "often"],
  occasional: [
    "experiencia pontual",
    "pontual",
    "occasional experience",
    "occasional",
  ],
  studied: [
    "estudei, sem experiencia profissional",
    "estudei",
    "studied, without professional experience",
    "studied",
  ],
};

export function competencyLevelOf(label: string): CompetencyLevel | null {
  const normalized = normalizeLabel(label);
  for (const level of competencyLevels) {
    if (competencyAliases[level].includes(normalized)) return level;
  }
  return null;
}

/** The labelled lines of an experience, as the template writes them. */
export const experienceFields = [
  "context",
  "responsibilities",
  "tools",
  "results",
  "notDone",
] as const;
export type ExperienceField = (typeof experienceFields)[number];

export const experienceFieldLabels: Record<
  ProfileLanguage,
  Record<ExperienceField, string>
> = {
  "pt-BR": {
    context: "Contexto (setor, tamanho do time, produto)",
    responsibilities: "Responsabilidades",
    tools: "Tecnologias",
    results: "Resultados",
    notDone: "O que NÃO fiz neste cargo (para não exagerar)",
  },
  "en-US": {
    context: "Context (sector, team size, product)",
    responsibilities: "Responsibilities",
    tools: "Tools",
    results: "Results",
    notDone: "What I did NOT do in this position (so as not to overstate)",
  },
};

/**
 * The labelled lines of a project (profile spec, "The document"): the
 * experience's fields where they fit a project, which has no employer and
 * no position, read by the same aliases.
 */
export const projectFieldLabels: Record<
  ProfileLanguage,
  Record<ExperienceField, string>
> = {
  "pt-BR": {
    context: "Contexto (o que é, para quem)",
    responsibilities: "O que fiz",
    tools: "Tecnologias",
    results: "Resultados",
    notDone: "O que NÃO fiz neste projeto (para não exagerar)",
  },
  "en-US": {
    context: "Context (what it is, for whom)",
    responsibilities: "What I did",
    tools: "Tools",
    results: "Results",
    notDone: "What I did NOT do in this project (so as not to overstate)",
  },
};

/** A project's optional role line ("Role: Founder"). */
export const projectRoleLabels: Record<ProfileLanguage, string> = {
  "pt-BR": "Papel",
  "en-US": "Role",
};

const projectRoleAliases = ["papel", "role", "funcao", "cargo"];

export function isProjectRoleLabel(label: string) {
  return projectRoleAliases.includes(normalizeLabel(label));
}

/** A project's optional link line ("Link: https://…"). */
export const projectLinkLabels: Record<ProfileLanguage, string> = {
  "pt-BR": "Link",
  "en-US": "Link",
};

const projectLinkAliases = [
  "link",
  "url",
  "site",
  "website",
  "repositorio",
  "repository",
  "repo",
];

export function isProjectLinkLabel(label: string) {
  return projectLinkAliases.includes(normalizeLabel(label));
}

const experienceFieldAliases: Record<ExperienceField, string[]> = {
  context: ["contexto", "context"],
  responsibilities: [
    "responsabilidades",
    "responsibilities",
    "o que fiz",
    "what i did",
  ],
  tools: [
    "tecnologias",
    "ferramentas",
    "stack",
    "tools",
    "technologies",
    "tech stack",
  ],
  results: ["resultados", "results", "achievements", "conquistas"],
  notDone: [
    "o que nao fiz neste cargo",
    "o que nao fiz neste projeto",
    "o que nao fiz",
    "what i did not do in this project",
    "what i did not do in this position",
    "what i did not do",
    "what i didn't do",
  ],
};

export function experienceFieldOf(label: string): ExperienceField | null {
  const normalized = normalizeLabel(label);
  for (const field of experienceFields) {
    if (experienceFieldAliases[field].includes(normalized)) return field;
  }
  return null;
}

/** The words of an experience title and of dated lines, per language. */
export const dateWords: Record<
  ProfileLanguage,
  { to: string; present: string }
> = {
  "pt-BR": { to: "a", present: "atual" },
  "en-US": { to: "to", present: "present" },
};

export const presentWords = [
  "atual",
  "presente",
  "hoje",
  "present",
  "current",
  "now",
];

/**
 * The document's language, from its section headings: Portuguese unless
 * most recognized headings are the English ones.
 */
export function documentLanguage(headings: string[]): ProfileLanguage {
  let english = 0;
  let portuguese = 0;
  for (const heading of headings) {
    if (!sectionKeyOf(heading)) continue;
    if (englishAliases.has(normalizeLabel(heading))) english++;
    else portuguese++;
  }
  return english > portuguese ? "en-US" : "pt-BR";
}

const englishAliases = new Set([
  "professional identity",
  "identity",
  "contact",
  "experience",
  "professional experience",
  "work experience",
  "projects",
  "personal projects",
  "side projects",
  "education",
  "certifications",
  "competencies",
  "skills",
  "languages",
  "known gaps",
  "gaps",
  "communication rules",
  "addenda",
  "addendum",
]);
