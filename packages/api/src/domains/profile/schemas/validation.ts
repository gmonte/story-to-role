import { z } from "zod";

import { competencyLevels, skillLevels } from "../truth/sections";
import { profileValidationStatusSchema } from "./profile";

/** What the quality review looks for (profile spec, "Validate and publish"). */
export const validationFindingKinds = [
  "noImpact",
  "mixedOwnership",
  "inconsistentFigure",
  "figureWithoutOrigin",
  "emptyNotDone",
  "unknown",
] as const;
export const validationFindingKindSchema = z.enum(validationFindingKinds);
export type ValidationFindingKind = z.infer<typeof validationFindingKindSchema>;

/** The model's answer; code keeps only quotes found in the draft. */
export const validationAnswerSchema = z.object({
  findings: z
    .array(
      z.object({
        kind: validationFindingKindSchema,
        quote: z
          .string()
          .describe(
            "The passage, copied word for word from the profile: the shortest one that pins the point, a sentence at most"
          ),
        message: z
          .string()
          .describe(
            "What to look at, in one or two sentences, as a question or a note"
          ),
      })
    )
    .max(30),
  competencies: z
    .array(
      z.object({
        name: z.string(),
        level: z.enum(skillLevels),
        reason: z.string(),
      })
    )
    .max(40),
});
export type ValidationAnswer = z.infer<typeof validationAnswerSchema>;

export const validationReportSchema = z.object({
  findings: z.array(
    z.object({
      kind: validationFindingKindSchema,
      quote: z.string(),
      message: z.string(),
    })
  ),
  competencies: z.array(
    z.object({
      name: z.string(),
      level: z.enum(competencyLevels),
      // The level the draft had when validated; null when it wasn't listed.
      current: z.enum(competencyLevels).nullable(),
      reason: z.string(),
    })
  ),
  // The parts that were reviewed, by title.
  reviewed: z.array(z.string()),
});
export type ValidationReport = z.infer<typeof validationReportSchema>;

export const profileValidationSchema = z.object({
  id: z.uuid(),
  status: profileValidationStatusSchema,
  draftRevision: z.number().int(),
  createdAt: z.date(),
  progress: z
    .object({
      step: z.number(),
      totalSteps: z.number(),
      label: z.string().optional(),
    })
    .nullable(),
  report: validationReportSchema.nullable(),
});
export type ProfileValidation = z.infer<typeof profileValidationSchema>;
