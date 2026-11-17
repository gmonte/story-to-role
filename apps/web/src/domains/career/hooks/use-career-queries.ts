"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "~/tools/trpc/client";

/** The timeline query, shared by every career component. */
export function useTimeline() {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.career.timeline.queryOptions({}),
    // An import under way reports its steps: followed until it ends.
    refetchInterval: (query) =>
      query.state.data?.documents.some(
        (document) => document.importStatus === "importing"
      )
        ? 2000
        : false,
  });
}

/**
 * Refreshes everything the career screen shows after a change: sources are
 * uploaded outside tRPC, so nothing else tells it one arrived.
 */
export function useRefreshCareer() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.career.pathKey() }),
    ]);
}
