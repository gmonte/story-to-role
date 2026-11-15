import type { ConflictField } from "../schemas/career";

export type ImportedPosition = {
  employer: string;
  title: string;
  startDate?: string;
  endDate?: string;
  location?: string;
};

export type TimelinePosition = ImportedPosition & { id: string };

export type PositionConflict = { field: ConflictField; options: string[] };

export type MergePlan = {
  creates: ImportedPosition[];
  updates: Array<{
    positionId: string;
    imported: ImportedPosition;
    conflicts: PositionConflict[];
    fill: { location?: string };
  }>;
};

// Legal-form suffixes that two resumes often spell differently.
const employerSuffixes =
  /\b(inc|incorporated|corp|corporation|co|company|ltd|ltda|llc|plc|gmbh|sa|s a|me|eireli|group|grupo)\b/g;

function normalizeEmployer(employer: string) {
  return employer
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(employerSuffixes, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function monthIndex(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  return year * 12 + month;
}

// Months two periods share; an open end date means "still there".
function overlapMonths(a: ImportedPosition, b: ImportedPosition) {
  if (!a.startDate || !b.startDate) return null;
  const end = (position: ImportedPosition) =>
    position.endDate ? monthIndex(position.endDate) : Number.MAX_SAFE_INTEGER;
  const start = Math.max(monthIndex(a.startDate), monthIndex(b.startDate));
  return Math.min(end(a), end(b)) - start + 1;
}

/**
 * Same employer and a real overlap. Periods that only touch (a promotion
 * starting the month the previous title ended) stay separate unless the
 * titles match; without dates, only the same title matches.
 */
export function isSamePosition(a: ImportedPosition, b: ImportedPosition) {
  if (normalizeEmployer(a.employer) !== normalizeEmployer(b.employer)) {
    return false;
  }
  const sameTitle = normalizeText(a.title) === normalizeText(b.title);
  const overlap = overlapMonths(a, b);
  if (overlap === null) return sameTitle;
  return overlap > 1 || (overlap > 0 && sameTitle);
}

function conflictsBetween(
  current: ImportedPosition,
  incoming: ImportedPosition
): PositionConflict[] {
  const conflicts: PositionConflict[] = [];

  if (normalizeText(current.title) !== normalizeText(incoming.title)) {
    conflicts.push({
      field: "title",
      options: [current.title, incoming.title],
    });
  }
  if (
    current.startDate &&
    incoming.startDate &&
    current.startDate !== incoming.startDate
  ) {
    conflicts.push({
      field: "startDate",
      options: [current.startDate, incoming.startDate],
    });
  }
  // "current" stands for an open end date: still in the position.
  const currentEnd = current.endDate ?? "current";
  const incomingEnd = incoming.endDate ?? "current";
  if (currentEnd !== incomingEnd) {
    conflicts.push({ field: "endDate", options: [currentEnd, incomingEnd] });
  }

  return conflicts;
}

/**
 * Plans how positions found in an imported file join the timeline: the same
 * position (same employer, overlapping period) found again becomes one entry,
 * and disagreeing titles or dates become conflicts for the user to pick,
 * never a silent choice. Matches against removed positions are left to the
 * caller (they are not passed in).
 */
export function mergeImportedPositions(
  timeline: TimelinePosition[],
  imported: ImportedPosition[]
): MergePlan {
  const plan: MergePlan = { creates: [], updates: [] };

  for (const incoming of imported) {
    const existing = timeline.find((position) =>
      isSamePosition(position, incoming)
    );

    // A second entry for the same position adds its own conflicts and
    // facts; nothing found in a file is silently dropped.
    if (existing) {
      plan.updates.push({
        positionId: existing.id,
        imported: incoming,
        conflicts: conflictsBetween(existing, incoming),
        fill:
          !existing.location && incoming.location
            ? { location: incoming.location }
            : {},
      });
      continue;
    }

    if (!plan.creates.some((created) => isSamePosition(created, incoming))) {
      plan.creates.push(incoming);
    }
  }

  return plan;
}
