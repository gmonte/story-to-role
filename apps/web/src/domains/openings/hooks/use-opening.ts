"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "~/tools/trpc/client";

/** An opening, polled while its analysis runs. */
export function useOpening(openingId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.openings.byId.queryOptions({ openingId }),
    refetchInterval: (query) =>
      query.state.data?.status === "processing" ? 2000 : false,
  });
}

export function useRefreshOpenings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: trpc.openings.pathKey() });
}
