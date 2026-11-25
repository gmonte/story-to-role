import { closedStatuses } from "@repo/api/domains/applications/schemas/application";
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
