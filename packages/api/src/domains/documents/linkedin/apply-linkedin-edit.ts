import { LockedFactEditError } from "../editing/apply-user-edit";
import type { Line } from "../schemas/document";
import type { CredentialEntry } from "../schemas/resume-content";
import type { LinkedinContent } from "../schemas/linkedin-content";

/** A credential's record as the profile states it, for comparison. */
const record = (entry: CredentialEntry) =>
  [
    entry.title,
    entry.institution,
    entry.level,
    entry.startDate,
    entry.endDate,
    entry.inProgress,
  ].join("\u0000");

/**
 * The user's edit of a LinkedIn text as a new snapshot's content, like a
 * resume's: a line whose text changed becomes “written by you”, and an
 * experience's locked facts are never edited here, nor a credential's
 * record. The headline may be one of the options, chosen as it is (it
 * keeps the option's trace) or reworded; an education's description may
 * be written, edited or removed; a language's LinkedIn level is the
 * user's to pick. The options themselves never change by an edit.
 */
export function applyLinkedinEdit(
  previous: LinkedinContent,
  next: LinkedinContent
): LinkedinContent {
  const before = new Map<string, Line>();
  for (const line of [
    previous.about,
    ...previous.headlineOptions,
    ...(previous.headline ? [previous.headline] : []),
    ...previous.education.flatMap((entry) =>
      entry.description ? [entry.description] : []
    ),
  ]) {
    before.set(line.id, line);
  }
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
  const lockedCredentials = (
    old: CredentialEntry[],
    edited: CredentialEntry[]
  ) => {
    const byId = new Map(old.map((entry) => [entry.credentialId, entry]));
    if (
      old.length !== edited.length ||
      edited.some((entry) => {
        const was = byId.get(entry.credentialId);
        return !was || record(was) !== record(entry);
      })
    ) {
      throw new LockedFactEditError(edited[0]?.credentialId ?? "credentials");
    }
  };
  lockedCredentials(previous.education, next.education);
  lockedCredentials(previous.certifications, next.certifications);
  lockedCredentials(previous.languages, next.languages);
  return {
    ...next,
    headline: next.headline?.text.trim() ? mark(next.headline) : null,
    headlineOptions: previous.headlineOptions,
    about: mark(next.about),
    education: next.education.map((entry) => ({
      ...entry,
      description: entry.description?.text.trim()
        ? mark(entry.description)
        : null,
    })),
    certifications: previous.certifications,
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
