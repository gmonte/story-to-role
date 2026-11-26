import {
  boardStatusSchema,
  type BoardFilter,
  type BoardOpening,
  type BoardSort,
  type BoardStatus,
  type ResumeOrigin,
} from "../schemas/tracker";

/** The kanban's columns, in the tracker's order. */
export const boardStatusOrder = boardStatusSchema.options;

/** An opening is open while it stands in one of these (and isn't closed). */
export const openBoardStatuses: BoardStatus[] = [
  "unanalyzed",
  "analyzed",
  "in_preparation",
  "applied",
  "in_process",
  "offer",
];

/** The fields SQL cannot see: encrypted (company, title) or derived in code. */
const memoryFields = [
  "company",
  "companyNot",
  "q",
  "resume",
  "resumeNot",
] as const;

/**
 * Whether a request needs the service to decrypt and derive before paging
 * (ADR 0014): a filter or sort on company, title or the resume's origin.
 */
export function needsMemory(filter: BoardFilter, sort: BoardSort) {
  if (sort === "company") return true;
  return memoryFields.some((field) => {
    const value = filter[field];
    return Array.isArray(value) ? value.length > 0 : !!value;
  });
}

const norm = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const contains = (text: string | null, part: string) =>
  norm(text ?? "").includes(norm(part.trim()));

type MemoryRow = Pick<BoardOpening, "company" | "title" | "resumeOrigin">;

/** The filter's encrypted and derived fields, once decrypted. */
export function matchesMemoryFilter(row: MemoryRow, filter: BoardFilter) {
  if (filter.company?.length) {
    if (!filter.company.some((part) => contains(row.company, part))) {
      return false;
    }
  }
  if (filter.companyNot?.some((part) => contains(row.company, part))) {
    return false;
  }
  if (filter.q && !contains(row.company, filter.q)) {
    if (!contains(row.title, filter.q)) return false;
  }
  // An opening with no application has no resume at all.
  if (filter.resume?.length) {
    if (!row.resumeOrigin || !filter.resume.includes(row.resumeOrigin)) {
      return false;
    }
  }
  if (row.resumeOrigin && filter.resumeNot?.includes(row.resumeOrigin)) {
    return false;
  }
  return true;
}

type SortRow = Pick<
  BoardOpening,
  "openingId" | "company" | "status" | "lastActivityAt" | "appliedAt"
>;

const time = (date: Date | null) => date?.getTime() ?? -Infinity;

/**
 * The order the SQL keyset uses, for rows sorted in memory: dates newest
 * first (not sent last), company A to Z, status in the tracker's order;
 * ties by last activity, then id.
 */
export function compareBoardRows(sort: BoardSort) {
  return (a: SortRow, b: SortRow) => {
    const byActivity =
      time(b.lastActivityAt) - time(a.lastActivityAt) ||
      (b.openingId > a.openingId ? 1 : b.openingId < a.openingId ? -1 : 0);
    switch (sort) {
      case "activity":
        return byActivity;
      case "sent":
        return time(b.appliedAt) - time(a.appliedAt) || byActivity;
      case "company":
        return (
          (a.company ?? "").localeCompare(b.company ?? "", undefined, {
            sensitivity: "base",
          }) || byActivity
        );
      case "status":
        return (
          boardStatusOrder.indexOf(a.status) -
            boardStatusOrder.indexOf(b.status) || byActivity
        );
    }
  };
}

export type ResumeCandidate = {
  // A resume sent, the one picked by hand, or the application's own.
  kind: "sent" | "picked" | "own";
  // Whether the version came from a library document.
  library: boolean;
  at: Date;
};

/**
 * The resume's origin (tracker spec, “The filter”): the latest resume sent,
 * else the one picked by hand for an external application, else the
 * application's own resume, written for it or copied from the library.
 */
export function resumeOriginOf(candidates: ResumeCandidate[]): ResumeOrigin {
  for (const kind of ["sent", "picked", "own"] as const) {
    const latest = candidates
      .filter((candidate) => candidate.kind === kind)
      .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    if (latest) return latest.library ? "library" : "written";
  }
  return "not_recorded";
}
