import { z } from "zod";

import { coverLetterContentSchema } from "./cover-letter-content";
import { linkedinContentSchema } from "./linkedin-content";
import { resumeContentSchema } from "./resume-content";

/** What a snapshot holds: a resume, a cover letter or LinkedIn text. */
export const documentContentSchema = z.discriminatedUnion("kind", [
  resumeContentSchema,
  coverLetterContentSchema,
  linkedinContentSchema,
]);
export type DocumentContent = z.infer<typeof documentContentSchema>;
