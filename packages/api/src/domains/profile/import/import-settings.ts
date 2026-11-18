/** The import's narrated steps, in order (the interface words them). */
export const importSteps = [
  "reading",
  "checking",
  "comparing",
  "suggesting",
] as const;

export const importSettings = {
  // Imports queue one at a time per user: one waiting behind four others
  // is still alive long after a single task would be.
  staleAfterMs: 30 * 60_000,
  // A just-started import has no task row for a moment.
  startingGraceMs: 30_000,
  // The content check reads the start and the end of a long file.
  checkHeadCharacters: 6000,
  checkTailCharacters: 3000,
  // A passage shorter than this proves nothing.
  minEvidenceCharacters: 12,
  // More than this from one file is noise the user won't review.
  maxChanges: 120,
  // What the agent says about what is still missing, at most.
  maxMissingCharacters: 500,
  maxOutputTokens: 32_000,
  // A file is compared in parts when it holds several positions, or when it
  // is longer than this (split by size into chunks of about the second).
  splitAboveCharacters: 24_000,
  chunkCharacters: 14_000,
  // Positions compared per call: up to this many, or this much text.
  experiencesPerCall: 3,
  experienceCharactersPerCall: 12_000,
  // The import's credit cap (30) pays for about this many comparisons;
  // what lies beyond is left out and said in the summary.
  maxComparisons: 10,
};
