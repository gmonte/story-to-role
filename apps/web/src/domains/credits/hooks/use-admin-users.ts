"use client";

import {
  cursorPageParams,
  useInfiniteCursorQuery,
} from "~/hooks/use-infinite-cursor-query";
import { useTRPC } from "~/tools/trpc/client";

const PAGE_LIMIT = 30;

/**
 * The admin's list of accounts, newest first, found by name or email and
 * loaded a page at a time as the list scrolls.
 */
export function useAdminUsers(search: string) {
  const trpc = useTRPC();
  return useInfiniteCursorQuery(
    trpc.credits.adminUsers.infiniteQueryOptions(
      { search: search || undefined, limit: PAGE_LIMIT },
      cursorPageParams
    )
  );
}
