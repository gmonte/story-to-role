import type { OutputLanguage } from "../schemas/document";
import type { ResumeSectionKind } from "../schemas/resume-content";

/**
 * Market conventions of each tested output language (resume spec, "Output
 * language"): section names and dates follow the document's language, not
 * the interface's. Shared by the editor and the PDF.
 */
export const sectionTitles: Record<
  OutputLanguage,
  Record<ResumeSectionKind, string>
> = {
  "en-US": {
    summary: "Summary",
    skills: "Skills",
    experience: "Professional experience",
    education: "Education",
    languages: "Languages",
    certifications: "Certifications",
    projects: "Projects",
    publications: "Publications",
    awards: "Awards",
    volunteering: "Volunteering",
    courses: "Courses",
  },
  "pt-BR": {
    summary: "Resumo",
    skills: "Competências",
    experience: "Experiência profissional",
    education: "Formação",
    languages: "Idiomas",
    certifications: "Certificações",
    projects: "Projetos",
    publications: "Publicações",
    awards: "Prêmios",
    volunteering: "Voluntariado",
    courses: "Cursos",
  },
};

const months: Record<OutputLanguage, string[]> = {
  "en-US": [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ],
  "pt-BR": [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ],
};

const present: Record<OutputLanguage, string> = {
  "en-US": "Present",
  "pt-BR": "atual",
};

/** "2024-11" → "Nov/2024" (English) or "nov/2024" (Portuguese). */
export function formatMonth(value: string | null, language: OutputLanguage) {
  if (!value) return "";
  const [year, month] = value.split("-");
  const index = Number(month) - 1;
  return month && index >= 0 && index < 12
    ? `${months[language][index]}/${year}`
    : year;
}

/** "Nov/2024 – Jul/2026"; an open end reads "Present" or "atual". */
export function formatPeriod(
  start: string | null,
  end: string | null,
  language: OutputLanguage
) {
  const from = formatMonth(start, language);
  const to = end ? formatMonth(end, language) : present[language];
  return from ? `${from} – ${to}` : to;
}

/** "Senior Engineer (parallel project)": the title with its context. */
export function positionTitleLine(entry: {
  title: string;
  context: string | null;
}) {
  return entry.context ? `${entry.title} (${entry.context})` : entry.title;
}

/** A compact credential line: "Institution · Title (level) Period". */
export function credentialLine(
  entry: {
    title: string;
    institution: string | null;
    level: string | null;
    startDate: string | null;
    endDate: string | null;
  },
  language: OutputLanguage
) {
  const title = entry.level ? `${entry.title} (${entry.level})` : entry.title;
  const period =
    entry.startDate || entry.endDate
      ? formatPeriod(entry.startDate, entry.endDate, language)
      : "";
  return (
    [entry.institution, title].filter(Boolean).join(" · ") +
    (period ? ` ${period}` : "")
  );
}
