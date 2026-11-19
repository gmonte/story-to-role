import { describe, expect, it } from "vitest";

import { coverageScoreBand, roundsTrail } from "./coverage-score";

const base = { target: 8, inconsistencies: 0 };

describe("coverage score", () => {
  it("bands the rating around the target", () => {
    expect(coverageScoreBand({ ...base, rating: 10 })).toBe("good");
    expect(coverageScoreBand({ ...base, rating: 8 })).toBe("good");
    expect(coverageScoreBand({ ...base, rating: 7 })).toBe("middling");
    expect(coverageScoreBand({ ...base, rating: 5 })).toBe("middling");
    expect(coverageScoreBand({ ...base, rating: 4 })).toBe("low");
  });

  it("reads a rating held down by an inconsistency as capped", () => {
    expect(
      coverageScoreBand({ target: 8, inconsistencies: 2, rating: 4 })
    ).toBe("capped");
    expect(
      coverageScoreBand({ target: 8, inconsistencies: 2, rating: 3 })
    ).toBe("capped");
  });

  it("lists the rounds in order", () => {
    expect(roundsTrail([{ rating: 6 }, { rating: 7 }, { rating: 8 }])).toBe(
      "6 · 7 · 8"
    );
  });
});
