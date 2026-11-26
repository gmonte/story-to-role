import { describe, expect, it } from "vitest";

import { isMonth, monthSpan, monthWeeks, shiftMonth } from "./calendar-month";

describe("calendar months", () => {
  it("shifts across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("validates a month", () => {
    expect(isMonth("2026-11")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth(null)).toBe(false);
  });

  it("lays a month out in whole weeks, Sunday first", () => {
    // November 2026 starts on a Sunday and ends on a Monday.
    const weeks = monthWeeks("2026-11");
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toMatchObject({ day: "2026-11-01", inMonth: true });
    expect(weeks[4][1]).toMatchObject({ day: "2026-11-30", inMonth: true });
    expect(weeks[4][2]).toMatchObject({ day: "2026-12-01", inMonth: false });
    // December 2026 starts on a Tuesday: two November days lead.
    expect(monthWeeks("2026-12")[0][0]).toMatchObject({
      day: "2026-11-29",
      inMonth: false,
    });
  });

  it("spans the whole weeks the grid shows", () => {
    expect(monthSpan("2026-11")).toEqual({
      from: "2026-11-01",
      to: "2026-12-05",
    });
    expect(monthSpan("2026-12")).toEqual({
      from: "2026-11-29",
      to: "2027-01-02",
    });
  });
});
