import { z } from "zod";

import type { AiClient } from "@repo/api/domains/ai/ai-client";
import { foldAccents } from "@repo/api/utils/text/fold-accents";

import type { ResumeContent } from "../schemas/resume-content";
import { resumeText } from "./resume-checks";
import { reviewerPrompt } from "./resume-prompts";
import { reviewLoopSettings } from "./review-loop-settings";

const reviewSchema = z.object({
  coverage: z
    .array(
      z.object({
        requirement: z.string(),
        level: z.enum(["strong", "partial", "not_proven"]),
      })
    )
    .catch([]),
  inconsistencies: z.array(z.string()).catch([]),
  advice: z.array(z.string()).catch([]),
});
export type Review = z.infer<typeof reviewSchema>;

const normalize = (text: string) => foldAccents(text).toLowerCase().trim();

/**
 * A draft's rating, from 1 to 10, by how much of its purpose it covers
 * (resume spec, "Review rounds"): strong coverage counts whole, partial
 * half. What the fit check found to be a gap is left out of the count: a
 * resume must not cover it, so it can't be held against it. A draft that
 * disagrees with the profile is never a good one.
 */
export function coverageRating(review: Review, gaps: string[]) {
  const lacking = new Set(gaps.map(normalize));
  const judged = review.coverage.filter(
    (item) => !lacking.has(normalize(item.requirement))
  );
  if (judged.length === 0) return 5;
  const covered = judged.reduce(
    (sum, item) =>
      sum + (item.level === "strong" ? 1 : item.level === "partial" ? 0.5 : 0),
    0
  );
  const rating = Math.min(
    10,
    Math.max(1, Math.round((10 * covered) / judged.length))
  );
  return review.inconsistencies.length > 0 ? Math.min(rating, 4) : rating;
}

/**
 * One reviewer's judgment of a resume's coverage of its purpose against
 * the profile (the method's reviewer prompt): the review as stored, and
 * what the call used. Never rewrites anything.
 */
export async function judgeResume(input: {
  ai: AiClient;
  material: string;
  content: ResumeContent;
  pages: number;
  maxPages: number;
}) {
  const { object, usage } = await input.ai.generateObject({
    purpose: "resume_review",
    role: "writing",
    maxTokens: reviewLoopSettings.reviewMaxTokens,
    schema: reviewSchema,
    system: reviewerPrompt({
      material: input.material,
      resume: resumeText(input.content),
      pages: input.pages,
      maxPages: input.maxPages,
    }),
    messages: [{ role: "user", content: "Review the resume." }],
  });
  const judged: Review = object ?? {
    coverage: [],
    inconsistencies: [],
    advice: [],
  };
  return { judged, usage };
}
