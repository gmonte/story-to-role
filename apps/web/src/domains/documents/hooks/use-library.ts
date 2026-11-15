"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/tools/trpc/client";

import { isProducing } from "./use-opening-documents";

export function useLibrary() {
  const trpc = useTRPC();
  return useQuery(trpc.library.list.queryOptions({}));
}

/** A library document, polled while it is generated or rendered. */
export function useLibraryDocument(documentId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.library.document.queryOptions({ documentId }),
    refetchInterval: (query) =>
      query.state.data && isProducing(query.state.data) ? 2500 : false,
  });
}
