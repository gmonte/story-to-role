import { z } from "zod";

import type { credentialKindSchema } from "@repo/api/domains/career/schemas/career";

import { lineSchema } from "./document";

/**
 * The section catalog (resume spec, "Global template"). On by default:
 * Summary, Skills, Experience, Education, Languages; the rest start off so
 * a resume fits in two pages.
 */
export const resumeSectionKinds = [
  "summary",
  "skills",
  "experience",
  "education",
  "languages",
  "certifications",
  "projects",
  "publications",
  "awards",
  "volunteering",
  "courses",
] as const;
export const resumeSectionKindSchema = z.enum(resumeSectionKinds);
export type ResumeSectionKind = z.infer<typeof resumeSectionKindSchema>;

export const defaultOnSections: ResumeSectionKind[] = [
  "summary",
  "skills",
  "experience",
  "education",
  "languages",
];

/** Sections listing credentials of one kind, filled by code, not the AI. */
export const credentialSections = {
  education: "education",
  languages: "language",
  certifications: "certification",
  publications: "publication",
  awards: "award",
  volunteering: "volunteering",
  courses: "course",
} as const satisfies Partial<
  Record<ResumeSectionKind, z.infer<typeof credentialKindSchema>>
>;
export type CredentialSectionKind = keyof typeof credentialSections;

/** A position as printed: its locked facts come from code, never the AI. */
export const experienceEntrySchema = z.object({
  positionId: z.uuid(),
  employer: z.string(),
  title: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  context: z.string().nullable(),
  // A very old experience: the requirement it entered the document for.
  relevance: z.string().nullable().optional(),
  lines: z.array(lineSchema),
});
export type ExperienceEntry = z.infer<typeof experienceEntrySchema>;

export const credentialEntrySchema = z.object({
  credentialId: z.uuid(),
  title: z.string(),
  institution: z.string().nullable(),
  level: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  inProgress: z.boolean(),
});
export type CredentialEntry = z.infer<typeof credentialEntrySchema>;

export const skillGroupSchema = lineSchema.extend({ label: z.string() });
export type SkillGroup = z.infer<typeof skillGroupSchema>;

export const projectEntrySchema = z.object({
  projectId: z.uuid(),
  name: z.string(),
  lines: z.array(lineSchema),
});

export const resumeSectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("summary"), line: lineSchema }),
  z.object({ kind: z.literal("skills"), groups: z.array(skillGroupSchema) }),
  z.object({
    kind: z.literal("experience"),
    entries: z.array(experienceEntrySchema),
  }),
  z.object({
    kind: z.literal("projects"),
    entries: z.array(projectEntrySchema),
  }),
  z.object({
    kind: z.enum(
      Object.keys(credentialSections) as [
        CredentialSectionKind,
        ...CredentialSectionKind[],
      ]
    ),
    entries: z.array(credentialEntrySchema),
  }),
]);
export type ResumeSection = z.infer<typeof resumeSectionSchema>;

export const resumeHeaderSchema = z.object({
  name: z.string(),
  titleLine: z.string(),
  contacts: z.array(z.string()),
  city: z.string().nullable(),
});
export type ResumeHeader = z.infer<typeof resumeHeaderSchema>;

/** A snapshot's structured content; PDFs and the editor render from it. */
export const resumeContentSchema = z.object({
  kind: z.literal("resume"),
  header: resumeHeaderSchema,
  sections: z.array(resumeSectionSchema),
});
export type ResumeContent = z.infer<typeof resumeContentSchema>;
