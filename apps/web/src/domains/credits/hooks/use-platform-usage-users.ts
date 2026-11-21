"use client";

import {
  cursorPageParams,
  useInfiniteCursorQuery,
} from "~/hooks/use-infinite-cursor-query";
import { useTRPC } from "~/tools/trpc/client";

const PAGE_LIMIT = 30;

/**
 * The admin's statement by user, the biggest spender first, filtered by
 * name or email and loaded a page at a time as the list scrolls.
 */
export function usePlatformUsageUsers(input: {
  from?: Date;
  to?: Date;
  search: string;
}) {
  const trpc = useTRPC();
  return useInfiniteCursorQuery(
    trpc.credits.platformUsageUsers.infiniteQueryOptions(
      { ...input, search: input.search || undefined, limit: PAGE_LIMIT },
      cursorPageParams
    )
  );
}
