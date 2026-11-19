import type { OutputLanguage } from "../schemas/document";
import type {
  LinkedinContent,
  LinkedinLanguage,
} from "../schemas/linkedin-content";
import type {
  CredentialEntry,
  ResumeContent,
  ResumeSection,
} from "../schemas/resume-content";
import { proficiencyLabel } from "./linkedin-proficiency";

/** LinkedIn's sections, in the order its profile shows them. */
export const linkedinSectionKinds = [
  "headline",
  "about",
  "experience",
  "projects",
  "education",
  "certifications",
  "languages",
] as const;
export type LinkedinSectionKind = (typeof linkedinSectionKinds)[number];

/** Each section as LinkedIn names it in the output language. */
export const linkedinSectionTitles: Record<
  OutputLanguage,
  Record<LinkedinSectionKind, string>
> = {
  "en-US": {
    headline: "Headline",
    about: "About",
    experience: "Experience",
    projects: "Projects",
    education: "Education",
    certifications: "Licenses & certifications",
    languages: "Languages",
  },
  "pt-BR": {
    headline: "Título",
    about: "Sobre",
    experience: "Experiência",
    projects: "Projetos",
    education: "Formação acadêmica",
    certifications: "Licenças e certificados",
    languages: "Idiomas",
  },
};

/**
 * A LinkedIn text as the resume machinery reads it: the chosen headline,
 * the About and each education's description as summaries, its
 * experiences and projects as theirs and the credentials as their
 * sections, with no header. The resume's code checks (locked facts,
 * figures, communication rules, bullet counts) and the coverage review run
 * on this view, so LinkedIn has no checks of its own to drift from the
 * resume's. The headline options not chosen are never copied, so they
 * aren't checked.
 */
export function linkedinAsResume(content: LinkedinContent): ResumeContent {
  const summaries = [
    content.headline,
    content.about,
    ...content.education.map((entry) => entry.description),
  ].flatMap((line): ResumeSection[] =>
    line ? [{ kind: "summary", line }] : []
  );
  const credentials = (
    kind: "education" | "certifications" | "languages",
    entries: CredentialEntry[]
  ): ResumeSection[] =>
    entries.length
      ? [{ kind, entries: entries.map(withoutLinkedinFields) }]
      : [];
  return {
    kind: "resume",
    header: { name: "", titleLine: "", contacts: [], city: null },
    sections: [
      ...summaries,
      {
        kind: "experience",
        entries: content.experiences.map((entry) => ({
          ...entry,
          context: null,
          relevance: null,
        })),
      },
      ...(content.projects.length
        ? [{ kind: "projects" as const, entries: content.projects }]
        : []),
      ...credentials("education", content.education),
      ...credentials("certifications", content.certifications),
      ...credentials("languages", content.languages),
    ],
  };
}

const withoutLinkedinFields = ({
  credentialId,
  title,
  institution,
  level,
  startDate,
  endDate,
  inProgress,
}: CredentialEntry): CredentialEntry => ({
  credentialId,
  title,
  institution,
  level,
  startDate,
  endDate,
  inProgress,
});

/** The About's paragraphs, as the editor and the copy action split them. */
export const aboutParagraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

/** An experience's (or project's) text to paste on LinkedIn: its bullets. */
export function experienceText(entry: { lines: Array<{ text: string }> }) {
  return entry.lines.map((line) => `• ${line.text}`).join("\n");
}

/** A certification as LinkedIn's form asks for it, on one line. */
export const certificationText = (entry: CredentialEntry) =>
  [entry.title, entry.institution, entry.endDate, entry.level]
    .filter(Boolean)
    .join(" — ");

/** A language with its level on LinkedIn's scale, or the profile's words. */
export const languageText = (
  entry: LinkedinLanguage,
  language: OutputLanguage
) =>
  [
    entry.title,
    entry.proficiency
      ? proficiencyLabel(entry.proficiency, language)
      : entry.level,
  ]
    .filter(Boolean)
    .join(" — ");

/**
 * The text a LinkedIn section copies: the chosen headline, the About, one
 * experience's, one project's (its description for LinkedIn's Projects
 * section), one education's description, or the certifications or
 * languages, one per line. Null for a section the text doesn't have.
 */
export function sectionText(
  content: LinkedinContent,
  section: string,
  language: OutputLanguage
) {
  if (section === "headline") return content.headline?.text ?? null;
  if (section === "about")
    return aboutParagraphs(content.about.text).join("\n\n");
  if (section === "certifications")
    return content.certifications.map(certificationText).join("\n") || null;
  if (section === "languages")
    return (
      content.languages.map((row) => languageText(row, language)).join("\n") ||
      null
    );
  const education = content.education.find(
    (row) => row.credentialId === section
  );
  if (education) return education.description?.text ?? null;
  const entry =
    content.experiences.find((row) => row.positionId === section) ??
    content.projects.find((row) => row.projectId === section);
  return entry ? experienceText(entry) : null;
}

/**
 * Whether a section is one the AI writes and the text has, so it can be
 * written again: `headline`, `about`, or a position's, project's or
 * education's id. Certifications and languages are printed by code.
 */
export function redoableSection(content: LinkedinContent, section: string) {
  return (
    section === "headline" ||
    section === "about" ||
    content.experiences.some((row) => row.positionId === section) ||
    content.projects.some((row) => row.projectId === section) ||
    content.education.some((row) => row.credentialId === section)
  );
}
