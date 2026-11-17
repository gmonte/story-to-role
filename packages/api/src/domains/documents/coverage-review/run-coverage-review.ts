import type { AiClient } from "@repo/api/domains/ai/ai-client";

import type { Purpose } from "../generation/assemble-resume";
import type { CareerContext } from "../generation/load-career-context";
import type { OpeningBrief } from "../generation/resume-prompts";
import type { OutputLanguage } from "../schemas/document";
import type { ResumeContent } from "../schemas/resume-content";
import {
  type CoverageReviewContent,
  coverageReviewDraftSchema,
  coverageReviewPrompt,
  keepReview,
} from "./coverage-review";

// A review lists at most a few dozen items.
const reviewMaxTokens = 4000;

/**
 * The AI part of the coverage review (resume spec, "Coverage review"; the
 * method's prompt 05), once per generated resume, in the generation's
 * price: one call that sees the final content, the requirements (or the
 * focus) with the fit check, the profile lines the document cites and the
 * instructions. Code keeps only what holds (`keepReview`).
 */
export async function reviewCoverage(input: {
  ai: AiClient;
  content: ResumeContent;
  context: CareerContext;
  brief: OpeningBrief;
  purposes: Purpose[];
  language: OutputLanguage;
}): Promise<CoverageReviewContent> {
  const { object } = await input.ai.generateObject({
    purpose: "coverage_review",
    role: "writing",
    maxTokens: reviewMaxTokens,
    schema: coverageReviewDraftSchema,
    system: coverageReviewPrompt(input),
    messages: [{ role: "user", content: "Review the resume's coverage." }],
  });
  // An answer that isn't a review is no review: the document is saved
  // without one rather than with invented gaps.
  if (!object) throw new Error("The coverage review returned no review");
  return keepReview({ ...input, draft: object });
}
