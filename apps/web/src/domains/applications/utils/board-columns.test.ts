import { describe, expect, it } from "vitest";

import { boardColumns } from "./board-columns";

describe("boardColumns", () => {
  it("shows every column with no filter, in the tracker's order", () => {
    expect(boardColumns({})).toEqual([
      "unanalyzed",
      "analyzed",
      "in_preparation",
      "applied",
      "in_process",
      "offer",
      "hired",
      "rejected",
      "withdrawn",
      "no_response",
      "closed",
    ]);
  });

  it("keeps the open columns for State is open", () => {
    expect(boardColumns({ state: ["open"] })).toEqual([
      "unanalyzed",
      "analyzed",
      "in_preparation",
      "applied",
      "in_process",
      "offer",
    ]);
  });

  it("drops Analyzed for State is closed, keeping those a closed opening may hold", () => {
    expect(boardColumns({ state: ["closed"] })).not.toContain("analyzed");
    expect(boardColumns({ state: ["closed"] })).toContain("applied");
    expect(boardColumns({ stateNot: ["open"] })).not.toContain("analyzed");
  });

  it("follows a status chip", () => {
    expect(boardColumns({ status: ["applied", "closed"] })).toEqual([
      "applied",
      "closed",
    ]);
    expect(boardColumns({ statusNot: ["analyzed"] })).not.toContain("analyzed");
  });
});
