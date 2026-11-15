import { z } from "zod";

import { outputLanguageSchema } from "./document";
import {
  defaultOnSections,
  resumeSectionKinds,
  resumeSectionKindSchema,
} from "./resume-content";

/**
 * A section of the global template. Conditions are checked by code: an
 * empty list means "always"; otherwise the section shows only for those
 * output languages and only when the opening (or the library focus)
 * mentions one of the keywords.
 */
export const templateSectionSchema = z.object({
  kind: resumeSectionKindSchema,
  enabled: z.boolean(),
  languages: z.array(outputLanguageSchema),
  keywords: z.array(z.string().trim().min(1).max(60)).max(20),
});
export type TemplateSection = z.infer<typeof templateSectionSchema>;

export const defaultTemplateSections: TemplateSection[] =
  resumeSectionKinds.map((kind) => ({
    kind,
    enabled: defaultOnSections.includes(kind),
    languages: [],
    keywords: [],
  }));

/** The header printed on every document; contacts are joined with "|". */
export const resumeHeaderFieldsSchema = z.object({
  name: z.string().trim().max(120),
  email: z.string().trim().max(200),
  phone: z.string().trim().max(60),
  linkedin: z.string().trim().max(200),
  github: z.string().trim().max(200),
  city: z.string().trim().max(120),
});
export type ResumeHeaderFields = z.infer<typeof resumeHeaderFieldsSchema>;

/** What a style profile records (resume spec, "Writing style and tone"). */
export const styleProfileSchema = z.object({
  sentenceLength: z.string().max(300),
  formality: z.string().max(300),
  preferredVocabulary: z.array(z.string().max(60)).max(30),
  wordsToAvoid: z.array(z.string().max(60)).max(30),
  firstPerson: z.string().max(300),
});
export type StyleProfile = z.infer<typeof styleProfileSchema>;
