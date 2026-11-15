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

// An open end date means "still there": compare it as far in the future.
function periodsOverlap(a: ImportedPosition, b: ImportedPosition) {
  if (!a.startDate || !b.startDate) return true;
  const aEnd = a.endDate ?? "9999-12";
  const bEnd = b.endDate ?? "9999-12";
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

function isSamePosition(a: ImportedPosition, b: ImportedPosition) {
  return (
    normalizeEmployer(a.employer) === normalizeEmployer(b.employer) &&
    periodsOverlap(a, b)
  );
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

    if (existing) {
      if (plan.updates.some((update) => update.positionId === existing.id)) {
        continue;
      }
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
