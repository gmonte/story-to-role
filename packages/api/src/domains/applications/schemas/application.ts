import { z } from "zod";

/**
 * Where an application stands (tracker spec, "Statuses and events"): few
 * statuses keep the funnel readable; details live in events.
 */
export const applicationStatusSchema = z.enum([
  "in_preparation",
  "applied",
  "in_process",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
  "no_response",
]);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

/** The statuses that close an application. */
export const closedStatuses: ApplicationStatus[] = [
  "hired",
  "rejected",
  "withdrawn",
  "no_response",
];

/** Waiting on the company: what "No response" closes after a while. */
export const awaitingStatuses: ApplicationStatus[] = ["applied", "in_process"];
