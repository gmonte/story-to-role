import { describe, expect, it } from "vitest";

import { computeBand, type JudgedTerm } from "./compute-band";

const term = (
  verdict: JudgedTerm["verdict"],
  importance: JudgedTerm["importance"] = "mandatory"
): JudgedTerm => ({ verdict, importance });

describe("the fit check's band", () => {
  it("is high when every mandatory requirement is met", () => {
    expect(
      computeBand([term("met"), term("met"), term("gap", "desirable")])
    ).toBe("high");
  });

  it("is medium when a mandatory requirement is met only in part", () => {
    expect(computeBand([term("met"), term("partial")])).toBe("medium");
  });

  it("is low when a mandatory requirement is missing", () => {
    expect(
      computeBand([term("met"), term("met"), term("met"), term("gap")])
    ).toBe("low");
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
