"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "~/tools/trpc/client";

/** The timeline query, shared by every career component. */
export function useTimeline() {
  const trpc = useTRPC();
  return useQuery(trpc.career.timeline.queryOptions({}));
}

/** Refreshes everything the career screen shows after a change. */
export function useRefreshCareer() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.career.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.interview.pathKey() }),
    ]);
}
