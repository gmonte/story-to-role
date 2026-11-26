import { describe, expect, it } from "vitest";

import { planBoardMove, planStatusMove } from "./status-move";

const mine = { status: "in_preparation", external: false } as const;

describe("planStatusMove", () => {
  it("does nothing when the status is the same", () => {
    expect(planStatusMove(mine, "in_preparation")).toEqual({ kind: "none" });
  });

  it("asks what was sent when applying from preparation", () => {
    expect(planStatusMove(mine, "applied")).toEqual({ kind: "mark_applied" });
  });

  it("rejects applying from a later status, except when made elsewhere", () => {
    expect(
      planStatusMove({ status: "in_process", external: false }, "applied")
    ).toEqual({ kind: "rejected", reason: "applied_from_preparation" });
    expect(
      planStatusMove({ status: "in_process", external: true }, "applied")
    ).toEqual({ kind: "set_status" });
  });

  it("asks for the reason when giving up", () => {
    expect(
      planStatusMove({ status: "applied", external: false }, "withdrawn")
    ).toEqual({ kind: "withdraw" });
  });

  it("never moves to no response by hand", () => {
    expect(
      planStatusMove({ status: "applied", external: false }, "no_response")
    ).toEqual({ kind: "rejected", reason: "no_response" });
  });

  it("changes the other statuses at once", () => {
    expect(planStatusMove(mine, "in_process")).toEqual({ kind: "set_status" });
    expect(
      planStatusMove({ status: "no_response", external: false }, "offer")
    ).toEqual({ kind: "set_status" });
  });
});

describe("planBoardMove", () => {
  const analyzed = { status: "analyzed", external: false } as const;

  it("creates the application for an analyzed opening, then moves it", () => {
    expect(planBoardMove(analyzed, "in_preparation")).toEqual({
      kind: "create_application",
      then: { kind: "none" },
    });
    expect(planBoardMove(analyzed, "applied")).toEqual({
      kind: "create_application",
      then: { kind: "mark_applied" },
    });
    expect(planBoardMove(analyzed, "in_process")).toEqual({
      kind: "create_application",
      then: { kind: "set_status" },
    });
    expect(planBoardMove(analyzed, "no_response")).toEqual({
      kind: "rejected",
      reason: "no_response",
    });
  });

  it("closes an analyzed opening dropped on Closed", () => {
    expect(planBoardMove(analyzed, "closed")).toEqual({
      kind: "close_opening",
    });
  });

  it("takes nothing back to Analyzed, and only analyzed cards to Closed", () => {
    const applied = { status: "applied", external: false } as const;
    expect(planBoardMove(applied, "analyzed")).toEqual({
      kind: "rejected",
      reason: "to_analyzed",
    });
    expect(planBoardMove(applied, "closed")).toEqual({
      kind: "rejected",
      reason: "to_closed",
    });
    expect(
      planBoardMove({ status: "closed", external: false }, "applied")
    ).toEqual({ kind: "rejected", reason: "from_closed" });
  });

  it("moves an application by the status rules", () => {
    expect(
      planBoardMove({ status: "applied", external: false }, "withdrawn")
    ).toEqual({ kind: "withdraw" });
  });
});
