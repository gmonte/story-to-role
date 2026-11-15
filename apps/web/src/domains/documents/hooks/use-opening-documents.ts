"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { DocumentView } from "@repo/api/domains/documents/schemas/document-view";

import { useTRPC } from "~/tools/trpc/client";

/** The opening's documents, polled while a generation runs. */
export function useOpeningDocuments(openingId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.documents.forOpening.queryOptions({ openingId }),
    refetchInterval: (query) =>
      query.state.data?.documents.some(isProducing) ? 2500 : false,
  });
}

/** Documents show in openings and the library: both refresh. */
export function useRefreshDocuments() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.documents.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.library.pathKey() }),
    ]);
  };
}

/** Polls while something in a document is still being produced. */
export const isProducing = (document: DocumentView) =>
  document.generation?.status === "pending" ||
  document.generation?.status === "running" ||
  document.versions.some((version) => version.pdf.rendering);
