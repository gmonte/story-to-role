import { z } from "zod";

import type { AiClient } from "@repo/api/domains/ai/ai-client";
import { foldAccents } from "@repo/api/utils/text/fold-accents";

import type { OutputLanguage } from "../schemas/document";
import type { ResumeContent } from "../schemas/resume-content";
import { inconsistencySchema } from "../schemas/review-inconsistency";
import { resumeText } from "./resume-checks";
import { outputLanguageNames, reviewerPrompt } from "./resume-prompts";
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
  inconsistencies: z.array(inconsistencySchema).catch([]),
  advice: z.array(z.string()).catch([]),
});
export type Review = z.infer<typeof reviewSchema>;

const normalize = (text: string) => foldAccents(text).toLowerCase().trim();

/** Whitespace, accents and case never tell two passages apart. */
const passage = (text: string) => normalize(text).replace(/\s+/g, " ");

/**
 * A draft's rating, from 1 to 10, by how much of its purpose it covers
 * (resume spec, "Review rounds"): strong coverage counts whole, partial
 * half. What the fit check found to be a gap is left out of the count: a
 * resume must not cover it, so it can't be held against it. A draft that
 * disagrees with the profile is not capped: the score measures only the
 * match, and contradictions are counted apart.
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
  return Math.min(10, Math.max(1, Math.round((10 * covered) / judged.length)));
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
  /** The user's interface language: what the feedback is written in. */
  feedbackLanguage: OutputLanguage;
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
      feedbackLanguage: outputLanguageNames[input.feedbackLanguage],
    }),
    messages: [{ role: "user", content: "Review the resume." }],
  });
  const resume = passage(resumeText(input.content));
  const judged: Review = object
    ? {
        ...object,
        // A contradiction without its exact quote in the draft is no proof.
        inconsistencies: object.inconsistencies.filter(
          (item) =>
            passage(item.quote) !== "" && resume.includes(passage(item.quote))
        ),
      }
    : { coverage: [], inconsistencies: [], advice: [] };
  return { judged, usage };
}
