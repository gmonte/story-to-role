import type { ApplicationStatus } from "@repo/api/domains/applications/schemas/application";

/**
 * What moving an application to another status takes (tracker spec,
 * "Statuses and events"), the same rules as the status select:
 * - `mark_applied`: "Applied" asks what was sent;
 * - `withdraw`: giving up asks for the reason;
 * - `set_status`: a plain change;
 * - `none`: it is already there;
 * - `rejected`: "No response" only comes with time, and "Applied" with
 *   documents only comes from "In preparation", through the dialog.
 */
export type StatusMove =
  | { kind: "none" }
  | { kind: "set_status" }
  | { kind: "mark_applied" }
  | { kind: "withdraw" }
  | { kind: "rejected"; reason: "no_response" | "applied_from_preparation" };

export function planStatusMove(
  application: { status: ApplicationStatus; external: boolean },
  to: ApplicationStatus
): StatusMove {
  if (to === application.status) return { kind: "none" };
  if (to === "no_response") return { kind: "rejected", reason: "no_response" };
  if (to === "withdrawn") return { kind: "withdraw" };
  if (to === "applied") {
    // An application made elsewhere has no documents to record.
    if (application.external) return { kind: "set_status" };
    return application.status === "in_preparation"
      ? { kind: "mark_applied" }
      : { kind: "rejected", reason: "applied_from_preparation" };
  }
  return { kind: "set_status" };
}
