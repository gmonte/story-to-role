import { z } from "zod";

/**
 * Where an application stands. The tracker (slice 7) adds the statuses
 * after "in preparation".
 */
export const applicationStatusSchema = z.enum([
  "in_preparation",
  "applied",
  "in_process",
  "hired",
  "rejected",
  "withdrawn",
]);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
