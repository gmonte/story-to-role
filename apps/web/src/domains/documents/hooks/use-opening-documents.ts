"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "~/tools/trpc/client";

/** The opening's documents, polled while a generation runs. */
export function useOpeningDocuments(openingId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.documents.forOpening.queryOptions({ openingId }),
    refetchInterval: (query) =>
      query.state.data?.documents.some(
        (document) =>
          document.generation?.status === "pending" ||
          document.generation?.status === "running"
      )
        ? 2500
        : false,
  });
}

export function useRefreshDocuments() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: trpc.documents.pathKey() });
}
