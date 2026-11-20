import { describe, expect, it } from "vitest";

import { planStatusMove } from "./status-move";

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
