"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "~/tools/trpc/client";

/** The application instructions of an opening, polled while they are split. */
export function useApplicationInstructions(openingId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.instructions.get.queryOptions({ openingId }),
    refetchInterval: (query) => (query.state.data?.splitting ? 2000 : false),
  });
}

export function useRefreshInstructions() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: trpc.instructions.pathKey() });
}
