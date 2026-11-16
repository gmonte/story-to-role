"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "~/tools/trpc/client";

/** The timeline query, shared by every career component. */
export function useTimeline() {
  const trpc = useTRPC();
  return useQuery(trpc.career.timeline.queryOptions({}));
}

/**
 * Refreshes everything the career screen shows after a change, the credit
 * meter included: imports are uploaded outside tRPC, so nothing else tells
 * it a reservation opened or settled.
 */
export function useRefreshCareer() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.career.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.interview.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.credits.pathKey() }),
    ]);
}
