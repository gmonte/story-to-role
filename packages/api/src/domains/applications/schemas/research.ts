import { z } from "zod";

import { taskProgressSchema } from "@repo/api/domains/tasks/schemas/task";

export const researchStatusSchema = z.enum(["researching", "done", "failed"]);
export type ResearchStatus = z.infer<typeof researchStatusSchema>;

/** What the extraction returns: short facts, each tied to a page found. */
export const companyFactsDraftSchema = z.object({
  facts: z.array(z.object({ text: z.string(), source_url: z.string() })),
});

export const companyFactViewSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  sourceUrl: z.url({ protocol: /^https?$/ }),
  sourceTitle: z.string(),
  approved: z.boolean(),
});
export type CompanyFactView = z.infer<typeof companyFactViewSchema>;

export const companyResearchSchema = z.object({
  status: researchStatusSchema.nullable(),
  // The research' live step while it runs (keys and counts, no content).
  progress: taskProgressSchema.nullable(),
  facts: z.array(companyFactViewSchema),
});
export type CompanyResearch = z.infer<typeof companyResearchSchema>;
