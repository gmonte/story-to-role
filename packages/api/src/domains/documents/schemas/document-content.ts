import { z } from "zod";

import { coverLetterContentSchema } from "./cover-letter-content";
import { resumeContentSchema } from "./resume-content";

/** What a snapshot holds: a resume or a cover letter. */
export const documentContentSchema = z.discriminatedUnion("kind", [
  resumeContentSchema,
  coverLetterContentSchema,
]);
export type DocumentContent = z.infer<typeof documentContentSchema>;
