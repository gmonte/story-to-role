import { describe, expect, it } from "vitest";

import { diffLines } from "./diff";

describe("comparing versions", () => {
  it("marks added and removed lines", () => {
    expect(diffLines("a\nb\nc", "a\nc\nd")).toEqual([
      { type: "same", text: "a" },
      { type: "removed", text: "b" },
      { type: "same", text: "c" },
      { type: "added", text: "d" },
    ]);
  });
});
