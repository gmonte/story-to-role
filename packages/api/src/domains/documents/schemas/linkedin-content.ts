import { z } from "zod";

import { linkedinProficiencySchema } from "../linkedin/linkedin-proficiency";
import { lineSchema } from "./document";
import { credentialEntrySchema } from "./resume-content";

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

/** An education as the profile states it, with an optional description. */
export const linkedinEducationSchema = credentialEntrySchema.extend({
  description: lineSchema.nullable(),
});
export type LinkedinEducation = z.infer<typeof linkedinEducationSchema>;

/** A language with its level on LinkedIn's scale, null when unread. */
export const linkedinLanguageSchema = credentialEntrySchema.extend({
  proficiency: linkedinProficiencySchema.nullable(),
});
export type LinkedinLanguage = z.infer<typeof linkedinLanguageSchema>;

/** A headline is at most this long on LinkedIn. */
export const headlineMaxLength = 220;

/**
 * A LinkedIn document's content (resume spec, "LinkedIn"): the chosen
 * headline and the options it was chosen from, the "About" section (one
 * line holding its short paragraphs separated by a blank line), each
 * experience's bullet text, each project's (for LinkedIn's Projects
 * section), the education with an optional description, and the
 * certifications and languages, printed by code. Lines cite profile lines
 * like resume bullets.
 */
export const linkedinContentSchema = z.object({
  kind: z.literal("linkedin"),
  // A text written before headlines existed has none of the sections
  // after `projects`, nor a headline.
  headline: lineSchema.nullable().default(null),
  headlineOptions: z.array(lineSchema).default([]),
  about: lineSchema,
  experiences: z.array(linkedinExperienceSchema),
  // A text written before projects existed has none.
  projects: z.array(linkedinProjectSchema).default([]),
  education: z.array(linkedinEducationSchema).default([]),
  certifications: z.array(credentialEntrySchema).default([]),
  languages: z.array(linkedinLanguageSchema).default([]),
});
export type LinkedinContent = z.infer<typeof linkedinContentSchema>;
