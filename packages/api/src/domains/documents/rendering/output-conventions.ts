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

const monthIndex = (name: string) => {
  const lower = name.toLowerCase();
  for (const list of Object.values(months)) {
    const index = list.findIndex((month) => month.toLowerCase() === lower);
    if (index >= 0) return index;
  }
  return -1;
};

/** "Nov/2024", "nov 2024", "2024-11" or "2024" → "2024-11" (or "2024"). */
export function parseMonth(text: string): string | null {
  const value = text.trim();
  const iso = /^(\d{4})(?:-(\d{2}))?$/.exec(value);
  if (iso) return iso[2] ? `${iso[1]}-${iso[2]}` : iso[1];
  const named = /^([a-zA-ZÀ-ÿ]{3,})[\s/.-]+(\d{4})$/.exec(value);
  if (named) {
    const index = monthIndex(named[1].slice(0, 3));
    return index >= 0
      ? `${named[2]}-${String(index + 1).padStart(2, "0")}`
      : null;
  }
  const numeric = /^(\d{1,2})[\s/.-]+(\d{4})$/.exec(value);
  if (numeric) {
    const month = Number(numeric[1]);
    return month >= 1 && month <= 12
      ? `${numeric[2]}-${String(month).padStart(2, "0")}`
      : null;
  }
  return null;
}

/**
 * A period as the editor shows it, typed back by the user: "Nov/2024 –
 * Jul/2026", "nov/2024 – atual", "2024-11 – 2026-07", a lone month, or
 * nothing at all (no dates). Null when it doesn't read as a period, so
 * the dates stay as they were.
 */
export function parsePeriod(
  text: string
): { startDate: string | null; endDate: string | null } | null {
  const value = text.trim();
  if (!value) return { startDate: null, endDate: null };
  const [from, to, ...rest] = value.split(
    /\s*[–—]\s*|\s+-\s+|\s+(?:to|a|até)\s+/i
  );
  if (rest.length) return null;
  const open = new Set(
    [
      ...Object.values(present),
      "present",
      "current",
      "now",
      "atual",
      "hoje",
    ].map((word) => word.toLowerCase())
  );
  const startDate = parseMonth(from);
  if (startDate === null && !open.has(from.toLowerCase())) return null;
  if (to === undefined) return { startDate, endDate: null };
  if (open.has(to.trim().toLowerCase())) return { startDate, endDate: null };
  const endDate = parseMonth(to);
  return endDate === null ? null : { startDate, endDate };
}
