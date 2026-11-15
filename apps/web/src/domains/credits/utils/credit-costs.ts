import type { CreditSummary } from "@repo/api/domains/credits/schemas/credits";
import type {
  ReviewDepth,
  WritingLevel,
} from "@repo/api/domains/documents/schemas/document";

type Estimates = CreditSummary["estimates"] | undefined;

const levelFactor = (writingLevel: WritingLevel) =>
  writingLevel === "maximum" ? 2 : 1;

/** A resume's cap for the chosen depth and level (as the server caps it). */
export const resumeCredits = (
  estimates: Estimates,
  choice: { reviewDepth: ReviewDepth; writingLevel: WritingLevel }
) =>
  estimates &&
  estimates.resumeBase *
    levelFactor(choice.writingLevel) *
    (choice.reviewDepth === "thorough" ? 2 : 1);

export const letterCredits = (
  estimates: Estimates,
  writingLevel: WritingLevel
) => estimates && estimates.coverLetter * levelFactor(writingLevel);
