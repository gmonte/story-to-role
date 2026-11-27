import type { ApplicationStatus } from "@repo/api/domains/applications/schemas/application";
import type { BoardStatus } from "@repo/api/domains/applications/schemas/tracker";

/**
 * What moving an application to another status takes (tracker spec,
 * "Statuses and events"), the same rules as the status select:
 * - `mark_applied`: "Applied" asks what was sent;
 * - `withdraw`: giving up asks for the reason;
 * - `set_status`: a plain change;
 * - `none`: it is already there;
 * - `rejected`: "No response" only comes with time, and an application
 *   never sent reaches "Applied" only from "In preparation", through the
 *   dialog; one already sent goes back to it as a plain change.
 */
export type StatusMove =
  | { kind: "none" }
  | { kind: "set_status" }
  | { kind: "mark_applied" }
  | { kind: "withdraw" }
  | { kind: "rejected"; reason: "no_response" | "applied_from_preparation" };

export function planStatusMove(
  application: { status: ApplicationStatus; appliedAt?: Date | null },
  to: ApplicationStatus
): StatusMove {
  if (to === application.status) return { kind: "none" };
  if (to === "no_response") return { kind: "rejected", reason: "no_response" };
  if (to === "withdrawn") return { kind: "withdraw" };
  if (to === "applied") {
    if (application.status === "in_preparation")
      return { kind: "mark_applied" };
    // Already sent: back to Applied, keeping what was sent and when.
    return application.appliedAt
      ? { kind: "set_status" }
      : { kind: "rejected", reason: "applied_from_preparation" };
  }
  return { kind: "set_status" };
}

/**
 * What moving a card on the Openings kanban takes (tracker spec, “Tracking:
 * metrics, list and kanban”): an application moves by the status rules; an
 * analyzed opening gets its application on the fly (then those rules), or
 * is closed when dropped on Closed; nothing goes back to Analyzed, and
 * Closed takes only analyzed openings.
 */
export type BoardMove =
  | Exclude<StatusMove, { kind: "rejected" }>
  | { kind: "close_opening" }
  | { kind: "create_application"; then: StatusMove }
  | {
      kind: "rejected";
      reason:
        | Extract<StatusMove, { kind: "rejected" }>["reason"]
        | "to_analyzed"
        | "to_closed"
        | "from_closed";
    };

export function planBoardMove(
  card: { status: BoardStatus; appliedAt?: Date | null },
  to: BoardStatus
): BoardMove {
  if (to === card.status) return { kind: "none" };
  if (to === "unanalyzed" || to === "analyzed") {
    return { kind: "rejected", reason: "to_analyzed" };
  }
  if (card.status === "closed") {
    return { kind: "rejected", reason: "from_closed" };
  }
  if (card.status === "unanalyzed" || card.status === "analyzed") {
    if (to === "closed") return { kind: "close_opening" };
    // The new application starts in preparation, with no documents.
    const then = planStatusMove({ status: "in_preparation" }, to);
    return then.kind === "rejected"
      ? then
      : { kind: "create_application", then };
  }
  if (to === "closed") return { kind: "rejected", reason: "to_closed" };
  return planStatusMove({ status: card.status, appliedAt: card.appliedAt }, to);
}
