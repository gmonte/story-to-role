"use client";

import { useMemo } from "react";

import {
  type InfiniteData,
  useInfiniteQuery,
  type UseInfiniteQueryOptions,
} from "@tanstack/react-query";

/**
 * Page-param reader for our keyset cursors. Pass as the options arg:
 * `trpc.x.y.infiniteQueryOptions(input, cursorPageParams)`.
 */
export const cursorPageParams = {
  getNextPageParam: (page: { nextCursor: string | null }) =>
    page.nextCursor ?? undefined,
};

/** Infers the row type from a paginated procedure's `infiniteQueryOptions`. */
type RowOf<TOptions> = TOptions extends { queryFn?: infer TFn }
  ? TFn extends (...args: never[]) => infer TReturn
    ? Awaited<TReturn> extends { data: infer TRows extends readonly unknown[] }
      ? TRows[number]
      : never
    : never
  : never;

/**
 * Wraps `useInfiniteQuery` for our cursor-infinite procedures: flattens the
 * loaded pages into `rows` and exposes the controls to load the next one.
 */
export function useInfiniteCursorQuery<TOptions>(options: TOptions) {
  const query = useInfiniteQuery(options as UseInfiniteQueryOptions);

  const data = query.data as
    InfiniteData<{ data: Array<RowOf<TOptions>>; total: number }> | undefined;

  // Stable identity while the loaded pages are unchanged, so consumers can
  // safely depend on `rows` in their own memos and effects.
  const rows = useMemo(
    () => (data?.pages ?? []).flatMap((page) => page.data),
    [data]
  );

  return {
    rows,
    // Total matching the filters (same on every page); read the first one.
    total: data?.pages[0]?.total,
    isLoading: query.isLoading,
    hasMore: Boolean(query.hasNextPage),
    loadingMore: query.isFetchingNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
  };
}
