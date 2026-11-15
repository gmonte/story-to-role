"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/tools/trpc/client";

/**
 * The credit meter's data, polled while a reservation is open so the
 * balance settles to the actual cost as soon as the task ends.
 */
export function useCredits() {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.credits.summary.queryOptions({}),
    staleTime: 0,
    refetchInterval: (query) =>
      (query.state.data?.reserved ?? 0) > 0 ? 4000 : false,
  });
}
