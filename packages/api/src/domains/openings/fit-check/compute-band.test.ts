import { describe, expect, it } from "vitest";

import { computeBand, type JudgedTerm } from "./compute-band";

const term = (
  verdict: JudgedTerm["verdict"],
  importance: JudgedTerm["importance"] = "mandatory"
): JudgedTerm => ({ verdict, importance });

describe("the fit check's band", () => {
  const many = (count: number, verdict: JudgedTerm["verdict"]) =>
    Array.from({ length: count }, () => term(verdict));

  it("is high when the mandatory requirements are nearly all met, none missing", () => {
    expect(
      computeBand([term("met"), term("met"), term("gap", "desirable")])
    ).toBe("high");
    // 9 met and 1 partial: 95%.
    expect(computeBand([...many(9, "met"), term("partial")])).toBe("high");
  });

  it("is medium, not high, with any mandatory requirement missing", () => {
    // 19 met and 1 gap: 95%, but one is missing.
    expect(computeBand([...many(19, "met"), term("gap")])).toBe("medium");
  });

  it("reads the mandatory requirements by proportion: partial counts half", () => {
    // 14 met, 7 partial, 1 gap: 17.5 of 22, about 80%.
    expect(
      computeBand([...many(14, "met"), ...many(7, "partial"), term("gap")])
    ).toBe("medium");
    // 1 met, 1 partial: 75%.
    expect(computeBand([term("met"), term("partial")])).toBe("medium");
    // 2 met, 2 gap: 50%.
    expect(computeBand([...many(2, "met"), ...many(2, "gap")])).toBe("low");
  });

  it("is low when the opening breaks a job preference, whatever it covers", () => {
    expect(
      computeBand([term("met"), term("met")], { breaksPreference: true })
    ).toBe("low");
  });

  it("reads coverage when nothing is named mandatory", () => {
    const desirable = (verdict: JudgedTerm["verdict"]) =>
      term(verdict, "desirable");
    expect(computeBand([desirable("met"), desirable("met")])).toBe("high");
    expect(computeBand([desirable("met"), desirable("gap")])).toBe("medium");
    expect(computeBand([desirable("gap"), desirable("gap")])).toBe("low");
    expect(computeBand([])).toBe("low");
  });
});
