import type { Timeline } from "./schemas/timeline";

/**
 * The timeline as prompt lines for the career chat's own messages: each
 * position with what is left to review, its approved numbers and the
 * disagreements between files.
 */
export function describeTimelineForPrompt(timeline: Timeline) {
  return timeline.positions.map((position) =>
    [
      `- ${position.title} at ${position.employer} (${position.startDate ?? "?"} to ${position.endDate ?? "now"}, ${position.status}):`,
      `${position.draftsToReview} facts to review,`,
      `${position.depth.counts.evidence} approved facts,`,
      `${position.depth.counts.resultsWithNumbers} approved results with numbers`,
      ...position.conflicts.map(
        (conflict) =>
          `; the files disagree on ${conflict.field}: ${conflict.options.join(" or ")}`
      ),
    ].join(" ")
  );
}
