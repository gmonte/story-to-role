import { LockedFactEditError } from "../editing/apply-user-edit";
import type { Line } from "../schemas/document";
import type { LinkedinContent } from "../schemas/linkedin-content";

/**
 * The user's edit of a LinkedIn text as a new snapshot's content, like a
 * resume's: a line whose text changed becomes “written by you”, and an
 * experience's locked facts are never edited here.
 */
export function applyLinkedinEdit(
  previous: LinkedinContent,
  next: LinkedinContent
): LinkedinContent {
  const before = new Map<string, Line>();
  before.set(previous.about.id, previous.about);
  for (const entry of [...previous.experiences, ...previous.projects]) {
    for (const line of entry.lines) before.set(line.id, line);
  }
  const lockedProjects = new Map(
    previous.projects.map((entry) => [entry.projectId, entry])
  );
  const locked = new Map(
    previous.experiences.map((entry) => [entry.positionId, entry])
  );
  const mark = (line: Line): Line => {
    const old = before.get(line.id);
    return old?.text === line.text
      ? { ...line, origin: old.origin }
      : { ...line, origin: { kind: "manual" } };
  };
  return {
    ...next,
    about: mark(next.about),
    experiences: next.experiences.map((entry) => {
      const old = locked.get(entry.positionId);
      if (
        old?.employer !== entry.employer ||
        old.title !== entry.title ||
        old.startDate !== entry.startDate ||
        old.endDate !== entry.endDate
      ) {
        throw new LockedFactEditError(entry.positionId);
      }
      return { ...entry, lines: entry.lines.map(mark) };
    }),
    projects: next.projects.map((entry) => {
      const old = lockedProjects.get(entry.projectId);
      if (
        old?.name !== entry.name ||
        old.role !== entry.role ||
        old.startDate !== entry.startDate ||
        old.endDate !== entry.endDate
      ) {
        throw new LockedFactEditError(entry.projectId);
      }
      return { ...entry, lines: entry.lines.map(mark) };
    }),
  };
}
