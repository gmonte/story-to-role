import { describe, expect, it } from "vitest";

import { planBoardMove, planStatusMove } from "./status-move";

const mine = { status: "in_preparation" } as const;

describe("planStatusMove", () => {
  it("does nothing when the status is the same", () => {
    expect(planStatusMove(mine, "in_preparation")).toEqual({ kind: "none" });
  });

  it("asks what was sent when applying from preparation", () => {
    expect(planStatusMove(mine, "applied")).toEqual({ kind: "mark_applied" });
  });

  it("rejects applying from a later status when it was never sent", () => {
    expect(planStatusMove({ status: "in_process" }, "applied")).toEqual({
      kind: "rejected",
      reason: "applied_from_preparation",
    });
  });

  it("goes back to applied at once when it was already sent", () => {
    const sent = { appliedAt: new Date("2026-11-10") };
    expect(
      planStatusMove({ status: "in_process", ...sent }, "applied")
    ).toEqual({ kind: "set_status" });
    expect(planStatusMove({ status: "rejected", ...sent }, "applied")).toEqual({
      kind: "set_status",
    });
    expect(planBoardMove({ status: "in_process", ...sent }, "applied")).toEqual(
      { kind: "set_status" }
    );
  });

  it("asks for the reason when giving up", () => {
    expect(planStatusMove({ status: "applied" }, "withdrawn")).toEqual({
      kind: "withdraw",
    });
  });

  it("never moves to no response by hand", () => {
    expect(planStatusMove({ status: "applied" }, "no_response")).toEqual({
      kind: "rejected",
      reason: "no_response",
    });
  });

  it("changes the other statuses at once", () => {
    expect(planStatusMove(mine, "in_process")).toEqual({ kind: "set_status" });
    expect(planStatusMove({ status: "no_response" }, "offer")).toEqual({
      kind: "set_status",
    });
  });
});

describe("planBoardMove", () => {
  const analyzed = { status: "analyzed" } as const;

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

  it("treats a registered opening, not analyzed, like an analyzed one", () => {
    const registered = { status: "unanalyzed" } as const;
    expect(planBoardMove(registered, "applied")).toEqual({
      kind: "create_application",
      then: { kind: "mark_applied" },
    });
    expect(planBoardMove(registered, "closed")).toEqual({
      kind: "close_opening",
    });
    expect(planBoardMove(analyzed, "unanalyzed")).toEqual({
      kind: "rejected",
      reason: "to_analyzed",
    });
  });

  it("closes an analyzed opening dropped on Closed", () => {
    expect(planBoardMove(analyzed, "closed")).toEqual({
      kind: "close_opening",
    });
  });

  it("takes nothing back to Analyzed, and only analyzed cards to Closed", () => {
    const applied = { status: "applied" } as const;
    expect(planBoardMove(applied, "analyzed")).toEqual({
      kind: "rejected",
      reason: "to_analyzed",
    });
    expect(planBoardMove(applied, "closed")).toEqual({
      kind: "rejected",
      reason: "to_closed",
    });
    expect(planBoardMove({ status: "closed" }, "applied")).toEqual({
      kind: "rejected",
      reason: "from_closed",
    });
  });

  it("moves an application by the status rules", () => {
    expect(planBoardMove({ status: "applied" }, "withdrawn")).toEqual({
      kind: "withdraw",
    });
  });
});
