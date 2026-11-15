import { resumeLines } from "../generation/resume-checks";
import type { Line } from "../schemas/document";
import type { ResumeContent, ResumeSection } from "../schemas/resume-content";

export class LockedFactEditError extends Error {}

/**
 * The user's edit as a new snapshot's content (resume spec, "Evidence
 * trace in the editor"): a line whose text changed, or a new one, becomes
 * "written by you"; untouched lines keep their origin. Locked facts are
 * not edited here: a different employer, title or dates for one
 * application is a locked-fact override, never a silent edit.
 */
export function applyUserEdit(
  previous: ResumeContent,
  next: ResumeContent
): ResumeContent {
  const before = new Map<string, Line>();
  for (const line of resumeLines(previous)) before.set(line.id, line);
  const lockedBefore = new Map(
    previous.sections.flatMap((section) =>
      section.kind === "experience"
        ? section.entries.map((entry) => [entry.positionId, entry] as const)
        : []
    )
  );

  const mark = <T extends Line>(line: T): T => {
    const old = before.get(line.id);
    return old?.text === line.text
      ? { ...line, origin: old.origin }
      : { ...line, origin: { kind: "manual" } };
  };

  return {
    ...next,
    sections: next.sections.map((section): ResumeSection => {
      switch (section.kind) {
        case "summary":
          return { ...section, line: mark(section.line) };
        case "skills":
          return { ...section, groups: section.groups.map(mark) };
        case "experience":
          return {
            ...section,
            entries: section.entries.map((entry) => {
              const locked = lockedBefore.get(entry.positionId);
              if (
                locked?.employer !== entry.employer ||
                locked.title !== entry.title ||
                locked.startDate !== entry.startDate ||
                locked.endDate !== entry.endDate
              ) {
                throw new LockedFactEditError(entry.positionId);
              }
              return { ...entry, lines: entry.lines.map(mark) };
            }),
          };
        case "projects":
          return {
            ...section,
            entries: section.entries.map((entry) => ({
              ...entry,
              lines: entry.lines.map(mark),
            })),
          };
        default:
          return section;
      }
    }),
  };
}
