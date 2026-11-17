import { z } from "zod";

/**
 * A story the profile tells, offered for the cover letter (resume spec,
 * "Cover letter inputs": "Story choice"): a results line, ranked by
 * similarity to the opening.
 */
export const letterStorySchema = z.object({
  // Sent back as `storyLineId` when the user picks it.
  lineId: z.string(),
  text: z.string(),
  position: z
    .object({
      positionId: z.uuid(),
      employer: z.string(),
      title: z.string(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
    })
    .nullable(),
  // The opening's requirements it answers, for the “why it fits” line.
  fits: z.array(z.string()),
});
export type LetterStoryView = z.infer<typeof letterStorySchema>;
