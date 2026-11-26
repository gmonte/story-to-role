import { closedStatuses } from "@repo/api/domains/applications/schemas/application";
import type { BoardFilter } from "@repo/api/domains/applications/schemas/tracker";
import type { OpeningSummary } from "@repo/api/domains/openings/schemas/opening-view";

/**
 * The sidebar group an opening is listed under. A closed opening is under
 * Closed, whatever its application; otherwise an application's status
 * places it (as the tracker does), and an opening without one by its own.
 */
export function sidebarGroup(
  opening: Pick<OpeningSummary, "status" | "applicationStatus">
) {
  if (opening.status === "closed") return "closed";
  const status = opening.applicationStatus;
  if (!status) return opening.status;
  if (status === "offer") return "in_process";
  if (closedStatuses.includes(status)) return "closed";
  return status;
}

/**
 * The groups the Openings page can list, and the filter that lists the
 * same openings there (“See more”): an open status, or every closed one.
 */
export const sidebarBoardGroups = [
  { group: "unanalyzed", filter: { status: ["unanalyzed"] } },
  { group: "analyzed", filter: { status: ["analyzed"] } },
  {
    group: "in_preparation",
    filter: { status: ["in_preparation"], state: ["open"] },
  },
  { group: "applied", filter: { status: ["applied"], state: ["open"] } },
  {
    group: "in_process",
    filter: { status: ["in_process", "offer"], state: ["open"] },
  },
  { group: "closed", filter: { state: ["closed"] } },
] as const satisfies ReadonlyArray<{ group: string; filter: BoardFilter }>;
