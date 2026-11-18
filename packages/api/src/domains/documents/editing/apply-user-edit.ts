import { resumeLines } from "../generation/resume-checks";
import type { Line } from "../schemas/document";
import type { ResumeContent, ResumeSection } from "../schemas/resume-content";
import { markEditedLine } from "./edited-origin";

export class LockedFactEditError extends Error {}

/**
 * The user's edit as a new snapshot's content (resume spec, "Trace in the
 * editor"): a new line is "written by you"; a traced line whose words
 * changed keeps its sources as "edited"; a line whose spacing or
 * punctuation alone changed keeps its origin. The header and a position's
 * employer, title, dates and context are the user's to change: a
 * difference from the profile is pointed out by the checks (the
 * `lockedFact` finding), never refused. Credentials are records of the
 * profile: entries may go, not change.
 */
export function applyUserEdit(
  previous: ResumeContent,
  next: ResumeContent
): ResumeContent {
  const before = new Map<string, Line>();
  for (const line of resumeLines(previous)) before.set(line.id, line);
  const mark = <T extends Line>(line: T): T =>
    markEditedLine(line, before.get(line.id));

  return {
    ...next,
    sections: next.sections.map((section): ResumeSection => {
      switch (section.kind) {
        case "summary":
          return { ...section, line: mark(section.line) };
        case "skills":
          return { ...section, groups: section.groups.map(mark) };
        case "experience":
        case "projects":
          return {
            ...section,
            entries: section.entries.map((entry) => ({
              ...entry,
              lines: entry.lines.map(mark),
            })),
          } as ResumeSection;
        default: {
          const before = previous.sections.find(
            (row) => row.kind === section.kind
          );
          for (const entry of section.entries) {
            const old =
              before && "entries" in before
                ? (before.entries as Array<{ credentialId?: string }>).find(
                    (row) => row.credentialId === entry.credentialId
                  )
                : undefined;
            if (!old || JSON.stringify(old) !== JSON.stringify(entry)) {
              throw new LockedFactEditError(entry.credentialId);
            }
          }
          return section;
        }
      }
    }),
  };
}
