"use client";

import { useQuery } from "@tanstack/react-query";

import type { ProfileBlock } from "@repo/api/domains/profile/truth/blocks";
import type { ValidationReport } from "@repo/api/domains/profile/schemas/validation";
import { findQuote } from "@repo/api/utils/text/verify-quote";

import { useTRPC } from "~/tools/trpc/client";

// How often a running validation's progress is read.
const pollMs = 2000;

/** The last validation, polled while it runs. */
export function useLatestValidation() {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.profile.latestValidation.queryOptions({}),
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? pollMs : false,
  });
}

export type LocatedReviewFinding = ValidationReport["findings"][number] & {
  line: number;
  from: number;
  to: number;
};

/**
 * Where each finding of the report is in the text now: its quote is
 * searched again, so edits since the validation move it along; a finding
 * whose passage is gone is dropped.
 */
export function locateReviewFindings(
  report: ValidationReport | null | undefined,
  blocks: ProfileBlock[]
): LocatedReviewFinding[] {
  if (!report) return [];
  return report.findings.flatMap((finding) => {
    // A quote across an item and the lines under it is marked on its first.
    const firstLine = finding.quote.split("\n")[0];
    for (const [line, block] of blocks.entries()) {
      const quote = findQuote(block.text, firstLine);
      if (!quote) continue;
      const from = block.text.indexOf(quote);
      return [{ ...finding, line, from, to: from + quote.length }];
    }
    return [];
  });
}
