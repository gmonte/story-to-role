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

/** Where the opening was found (tracker spec, "What each application records"). */
export const applicationSourceSchema = z.enum([
  "linkedin",
  "company_site",
  "referral",
  "job_board",
  "other",
]);
export type ApplicationSource = z.infer<typeof applicationSourceSchema>;

/** Simplified (one-click on a job board) or external (the company's own form). */
export const applicationTypeSchema = z.enum(["simplified", "external"]);
export type ApplicationType = z.infer<typeof applicationTypeSchema>;
