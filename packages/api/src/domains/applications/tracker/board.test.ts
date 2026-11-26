import { describe, expect, it } from "vitest";

import type { BoardOpening } from "../schemas/tracker";
import {
  compareBoardRows,
  matchesMemoryFilter,
  needsMemory,
  resumeOriginOf,
} from "./board";

const row = (over: Partial<BoardOpening>): BoardOpening => ({
  openingId: "00000000-0000-4000-8000-000000000001",
  applicationId: null,
  company: "Acme",
  title: "Platform Engineer",
  status: "analyzed",
  state: "open",
  external: false,
  lastActivityAt: new Date("2026-11-01"),
  appliedAt: null,
  source: null,
  fitBand: null,
  resumeOrigin: null,
  nextEvent: null,
  nextStep: null,
  ...over,
});

describe("needsMemory", () => {
  it("is false for structured filters and sorts", () => {
    expect(
      needsMemory({ status: ["applied"], fit: ["high"] }, "activity")
    ).toBe(false);
    expect(needsMemory({}, "status")).toBe(false);
  });

  it("is true for company, text, resume origin or the company sort", () => {
    expect(needsMemory({ company: ["ac"] }, "activity")).toBe(true);
    expect(needsMemory({ q: "eng" }, "activity")).toBe(true);
    expect(needsMemory({ resumeNot: ["library"] }, "activity")).toBe(true);
    expect(needsMemory({}, "company")).toBe(true);
  });
});

describe("matchesMemoryFilter", () => {
  it("finds a company by part of its name, ignoring case and accents", () => {
    const opening = row({ company: "Ação Digital" });
    expect(matchesMemoryFilter(opening, { company: ["acao"] })).toBe(true);
    expect(matchesMemoryFilter(opening, { company: ["globex", "DIG"] })).toBe(
      true
    );
    expect(matchesMemoryFilter(opening, { companyNot: ["digital"] })).toBe(
      false
    );
  });

  it("searches the free text in company or title", () => {
    const opening = row({ company: "Acme", title: "Platform Engineer" });
    expect(matchesMemoryFilter(opening, { q: "platform" })).toBe(true);
    expect(matchesMemoryFilter(opening, { q: "acm" })).toBe(true);
    expect(matchesMemoryFilter(opening, { q: "designer" })).toBe(false);
  });

  it("leaves openings with no application out of a resume filter", () => {
    expect(matchesMemoryFilter(row({}), { resume: ["not_recorded"] })).toBe(
      false
    );
    expect(matchesMemoryFilter(row({}), { resumeNot: ["written"] })).toBe(true);
    expect(
      matchesMemoryFilter(row({ resumeOrigin: "written" }), {
        resume: ["written", "library"],
      })
    ).toBe(true);
  });
});

describe("compareBoardRows", () => {
  const a = row({
    openingId: "00000000-0000-4000-8000-00000000000a",
    company: "beta",
    status: "applied",
    lastActivityAt: new Date("2026-11-02"),
    appliedAt: new Date("2026-10-01"),
  });
  const b = row({
    openingId: "00000000-0000-4000-8000-00000000000b",
    company: "Alpha",
    status: "analyzed",
    lastActivityAt: new Date("2026-11-03"),
  });
  const c = row({
    openingId: "00000000-0000-4000-8000-00000000000c",
    company: "Gamma",
    status: "closed",
    lastActivityAt: new Date("2026-11-01"),
    appliedAt: new Date("2026-10-05"),
  });
  const ids = (sort: Parameters<typeof compareBoardRows>[0]) =>
    [a, b, c].sort(compareBoardRows(sort)).map((r) => r.company);

  it("sorts by activity, sent date, company and status", () => {
    expect(ids("activity")).toEqual(["Alpha", "beta", "Gamma"]);
    // Not sent goes last.
    expect(ids("sent")).toEqual(["Gamma", "beta", "Alpha"]);
    expect(ids("company")).toEqual(["Alpha", "beta", "Gamma"]);
    expect(ids("status")).toEqual(["Alpha", "beta", "Gamma"]);
  });
});

describe("resumeOriginOf", () => {
  const at = (day: number) => new Date(2026, 10, day);

  it("reads the latest resume sent first", () => {
    expect(
      resumeOriginOf([
        { kind: "own", library: false, at: at(9) },
        { kind: "sent", library: true, at: at(1) },
        { kind: "sent", library: false, at: at(2) },
      ])
    ).toBe("written");
  });

  it("falls back to the picked resume, then the application's own", () => {
    expect(
      resumeOriginOf([
        { kind: "own", library: false, at: at(1) },
        { kind: "picked", library: true, at: at(1) },
      ])
    ).toBe("library");
    expect(resumeOriginOf([{ kind: "own", library: true, at: at(1) }])).toBe(
      "library"
    );
    expect(resumeOriginOf([])).toBe("not_recorded");
  });
});
