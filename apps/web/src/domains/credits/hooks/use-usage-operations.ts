"use client";

import {
  cursorPageParams,
  useInfiniteCursorQuery,
} from "~/hooks/use-infinite-cursor-query";
import { useTRPC } from "~/tools/trpc/client";

const PAGE_LIMIT = 30;

/**
 * The usage statement's operations, newest first, loaded a page at a time
 * as the list scrolls; without a period, the plan's current credit month.
 */
export function useUsageOperations(period: { from?: Date; to?: Date } = {}) {
  const trpc = useTRPC();
  return useInfiniteCursorQuery(
    trpc.credits.usageOperations.infiniteQueryOptions(
      { ...period, limit: PAGE_LIMIT },
      cursorPageParams
    )
  );
}
