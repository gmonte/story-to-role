import { describe, expect, it } from "vitest";

import { computeBand, type JudgedTerm } from "./compute-band";

const met = (category: JudgedTerm["category"] = "tool"): JudgedTerm => ({
  category,
  verdict: "met",
});
const gap = (category: JudgedTerm["category"] = "tool"): JudgedTerm => ({
  category,
  verdict: "gap",
});

describe("fit band", () => {
  it("is high when nearly everything is met", () => {
    expect(computeBand([met(), met(), met(), met(), gap()])).toBe("high");
  });

  it("counts partial matches as half", () => {
    expect(
      computeBand([
        met(),
        { category: "tool", verdict: "partial" },
        gap(),
        met(),
      ])
    ).toBe("medium");
  });

  it("caps the band when a hard requirement is a gap", () => {
    expect(
      computeBand([met(), met(), met(), met(), met(), gap("seniority")])
    ).toBe("medium");
    expect(
      computeBand([
        met(),
        met(),
        met(),
        met(),
        gap("seniority"),
        gap("location"),
      ])
    ).toBe("low");
  });

  it("is low with nothing to compare", () => {
    expect(computeBand([])).toBe("low");
  });
});
