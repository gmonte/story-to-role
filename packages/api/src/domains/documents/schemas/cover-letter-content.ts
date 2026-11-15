import { z } from "zod";

import { lineSchema } from "./document";
import { resumeHeaderSchema } from "./resume-content";

/**
 * A cover letter's structured content (resume spec, "Methodology:
 * storytelling" and "Layout"): the resume's header, then the letter. Each
 * paragraph is a line with its sources, like a resume bullet.
 */
export const coverLetterContentSchema = z.object({
  kind: z.literal("cover_letter"),
  header: resumeHeaderSchema,
  greeting: z.string(),
  paragraphs: z.array(lineSchema),
  closing: z.string(),
});
export type CoverLetterContent = z.infer<typeof coverLetterContentSchema>;
