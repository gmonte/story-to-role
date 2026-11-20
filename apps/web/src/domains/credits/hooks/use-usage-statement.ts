"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/tools/trpc/client";

/**
 * The usage statement for a period; without one, the plan's current credit
 * month (or the last 30 days on Free), as the server decides.
 */
export function useUsageStatement(period: { from?: Date; to?: Date } = {}) {
  const trpc = useTRPC();
  return useQuery(trpc.credits.usageStatement.queryOptions(period));
}
