"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "~/tools/trpc/client";

export function useReminders() {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.tracker.reminders.queryOptions({}),
    // Reminders depend on the clock: refreshed every few minutes.
    refetchInterval: 5 * 60 * 1000,
  });
}

/** The tracker shows in the sidebar, the opening and its page: all refresh. */
export function useRefreshTracker() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.tracker.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.openings.pathKey() }),
    ]);
  };
}
