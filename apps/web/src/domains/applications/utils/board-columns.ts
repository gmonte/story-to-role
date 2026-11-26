import type {
  BoardFilter,
  BoardStatus,
} from "@repo/api/domains/applications/schemas/tracker";

import { boardFieldValues } from "./board-filter";

const boardStates = boardFieldValues.state;

const openStatuses: BoardStatus[] = [
  "analyzed",
  "in_preparation",
  "applied",
  "in_process",
  "offer",
];

/**
 * The kanban's columns for a filter: every board status in order, less
 * those the filter rules out (a status chip, or a state no card in that
 * column can have: an analyzed opening is always open).
 */
export function boardColumns(filter: BoardFilter): BoardStatus[] {
  return boardFieldValues.status.filter((status) => {
    if (filter.status?.length && !filter.status.includes(status)) return false;
    if (filter.statusNot?.includes(status)) return false;
    const allowed = (filter.state?.length ? filter.state : boardStates).filter(
      (state) => !filter.stateNot?.includes(state)
    );
    // An analyzed opening is always open; the other open statuses close
    // with their opening, so they may be either.
    if (status === "analyzed") return allowed.includes("open");
    if (openStatuses.includes(status)) return allowed.length > 0;
    return allowed.includes("closed");
  });
}
