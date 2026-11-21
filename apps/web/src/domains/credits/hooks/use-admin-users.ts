"use client";

import type { AdminUser } from "@repo/api/domains/credits/schemas/credits";

import {
  cursorPageParams,
  useInfiniteCursorQuery,
} from "~/hooks/use-infinite-cursor-query";
import { useTRPC } from "~/tools/trpc/client";

const PAGE_LIMIT = 30;

type AdminPlan = AdminUser["plan"];

/**
 * The admin's list of accounts, newest first, found by name or email (and
 * plan) and
 * loaded a page at a time as the list scrolls.
 */
export function useAdminUsers(input: { search: string; plan?: AdminPlan }) {
  const trpc = useTRPC();
  return useInfiniteCursorQuery(
    trpc.credits.adminUsers.infiniteQueryOptions(
      {
        search: input.search || undefined,
        plan: input.plan,
        limit: PAGE_LIMIT,
      },
      cursorPageParams
    )
  );
}
