import type { CareerContext } from "../generation/load-career-context";
import {
  credentialSections,
  type ResumeContent,
} from "../schemas/resume-content";

type Printed = Pick<CareerContext, "header" | "positions" | "credentials">;

/**
 * Prints a resume's code-printed fields again from a career context (the
 * employer and title of each position, each credential's name, institution
 * and level, the header's city): what an adaptation into another language
 * does, and what "Use version N" does so a dictionary entry published
 * since applies. With `from`, the context the content was printed from,
 * only a field the user left as printed changes; an edited one stays.
 * Titles are reprinted only with `from` (an adaptation decides them apart).
 */
export function reprintFields(
  content: ResumeContent,
  to: Printed,
  from?: Printed
): ResumeContent {
  const unchanged = (value: string | null, printed: string | null) =>
    !from || value === printed;
  const toPosition = new Map(to.positions.map((row) => [row.id, row]));
  const fromPosition = new Map(
    (from?.positions ?? []).map((row) => [row.id, row])
  );
  // Credentials keep no id across profile versions: the same kind, in the
  // same order, is the same credential when the lists have the same size.
  const ofKind = (printed: Printed, kind: string) =>
    printed.credentials.filter((row) => row.kind === kind);
  const city =
    to.header.city && unchanged(content.header.city, from?.header.city ?? null)
      ? to.header.city
      : content.header.city;
  return {
    ...content,
    header: { ...content.header, city },
    sections: content.sections.map((section) => {
      if (section.kind === "experience") {
        return {
          ...section,
          entries: section.entries.map((entry) => {
            const position = toPosition.get(entry.positionId);
            const before = fromPosition.get(entry.positionId);
            if (!position || (from && !before)) return entry;
            return {
              ...entry,
              employer: unchanged(entry.employer, before?.employer ?? null)
                ? position.employer
                : entry.employer,
              title:
                from && unchanged(entry.title, before?.title ?? null)
                  ? position.title
                  : entry.title,
            };
          }),
        };
      }
      if (
        section.kind === "summary" ||
        section.kind === "skills" ||
        section.kind === "projects"
      ) {
        return section;
      }
      const kind = credentialSections[section.kind];
      const toRows = ofKind(to, kind);
      const fromRows = from ? ofKind(from, kind) : toRows;
      const byIndex = fromRows.length === toRows.length;
      return {
        ...section,
        entries: section.entries.map((entry, index) => {
          const credential = from
            ? byIndex &&
              fromRows[index]?.id === entry.credentialId &&
              toRows[index]
            : toRows.find((row) => row.id === entry.credentialId);
          const before = from ? fromRows[index] : credential;
          if (!credential || !before) return entry;
          return {
            ...entry,
            credentialId: credential.id,
            title: unchanged(entry.title, before.title)
              ? credential.title
              : entry.title,
            institution: unchanged(entry.institution, before.institution)
              ? credential.institution
              : entry.institution,
            level: unchanged(entry.level, before.level)
              ? credential.level
              : entry.level,
          };
        }),
      };
    }),
  };
}
