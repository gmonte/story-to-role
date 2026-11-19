import type { ApplicationStatus } from "@repo/api/domains/applications/schemas/application";

/** Only moving to withdrawn from another status asks for the reason. */
export function asksReason(
  next: ApplicationStatus,
  current: ApplicationStatus
) {
  return next === "withdrawn" && current !== "withdrawn";
}
