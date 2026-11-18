import { z } from "zod";

import { lineSchema } from "./document";

/** A position as LinkedIn prints it: locked facts from code, text as lines. */
export const linkedinExperienceSchema = z.object({
  positionId: z.uuid(),
  employer: z.string(),
  title: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  lines: z.array(lineSchema),
});
export type LinkedinExperience = z.infer<typeof linkedinExperienceSchema>;

/**
 * A LinkedIn document's content (resume spec, "LinkedIn"): the "About"
 * section, one line holding its short paragraphs separated by a blank
 * line, and each experience's bullet text. Lines cite profile lines like
 * resume bullets.
 */
export const linkedinContentSchema = z.object({
  kind: z.literal("linkedin"),
  about: lineSchema,
  experiences: z.array(linkedinExperienceSchema),
});
export type LinkedinContent = z.infer<typeof linkedinContentSchema>;
