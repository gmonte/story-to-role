import { describe, expect, it } from "vitest";

import { asksReason } from "./withdraw";

describe("asksReason", () => {
  it("asks only when moving to withdrawn from another status", () => {
    expect(asksReason("withdrawn", "applied")).toBe(true);
    expect(asksReason("withdrawn", "withdrawn")).toBe(false);
    expect(asksReason("in_process", "applied")).toBe(false);
  });
});
