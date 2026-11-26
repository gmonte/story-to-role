"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type {
  BoardFilter,
  BoardSort,
  BoardStatus,
} from "@repo/api/domains/applications/schemas/tracker";

import {
  cursorPageParams,
  useInfiniteCursorQuery,
} from "~/hooks/use-infinite-cursor-query";
import { useTRPC } from "~/tools/trpc/client";

import {
  boardFilterKeys,
  boardQueryToParams,
  isDefaultBoardFilter,
  parseBoardQuery,
} from "../utils/board-filter";

/** The Openings page's filter and sort, kept in the URL. */
export function useBoardQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { filter, sort } = parseBoardQuery(params);
  const write = (next: BoardFilter, nextSort: BoardSort) => {
    const query = new URLSearchParams(params.toString());
    for (const key of boardFilterKeys) query.delete(key);
    for (const [key, value] of boardQueryToParams(next, nextSort)) {
      query.append(key, value);
    }
    const search = query.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, {
      scroll: false,
    });
  };
  return {
    filter,
    sort,
    isDefault: isDefaultBoardFilter(filter),
    setFilter: (next: BoardFilter) => write(next, sort),
    setSort: (next: BoardSort) => write(filter, next),
  };
}

/** One page after another of the openings the filter matches (ADR 0013). */
export function useBoard(input: {
  filter: BoardFilter;
  sort: BoardSort;
  column?: BoardStatus;
  limit: number;
}) {
  const trpc = useTRPC();
  return useInfiniteCursorQuery(
    trpc.tracker.board.infiniteQueryOptions(
      {
        ...input.filter,
        sort: input.sort,
        column: input.column,
        limit: input.limit,
      },
      cursorPageParams
    )
  );
}
