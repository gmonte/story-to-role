import { describe, expect, it } from "vitest";

import { daysSince } from "./dates";

describe("daysSince", () => {
  it("counts whole days and never goes negative", () => {
    const now = new Date("2026-01-11T10:00:00Z");
    expect(daysSince(new Date("2026-01-01T12:00:00Z"), now)).toBe(9);
    expect(daysSince(new Date("2026-02-01"), now)).toBe(0);
  });
});
