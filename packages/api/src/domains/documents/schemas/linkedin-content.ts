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

/** A project as LinkedIn's Projects section takes it: name, dates, text. */
export const linkedinProjectSchema = z.object({
  projectId: z.uuid(),
  name: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  role: z.string().nullable().default(null),
  link: z.string().nullable().default(null),
  lines: z.array(lineSchema),
});
export type LinkedinProject = z.infer<typeof linkedinProjectSchema>;

/**
 * A LinkedIn document's content (resume spec, "LinkedIn"): the "About"
 * section, one line holding its short paragraphs separated by a blank
 * line, each experience's bullet text and, after the experiences, each
 * project's (for LinkedIn's Projects section). Lines cite profile lines
 * like resume bullets.
 */
export const linkedinContentSchema = z.object({
  kind: z.literal("linkedin"),
  about: lineSchema,
  experiences: z.array(linkedinExperienceSchema),
  // A text written before projects existed has none.
  projects: z.array(linkedinProjectSchema).default([]),
});
export type LinkedinContent = z.infer<typeof linkedinContentSchema>;
