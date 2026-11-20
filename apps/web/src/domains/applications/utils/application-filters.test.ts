import { describe, expect, it } from "vitest";

import type { TrackedApplication } from "@repo/api/domains/applications/schemas/tracker";

import {
  daysSince,
  defaultFilters,
  filterApplications,
  filtersToParams,
  parseFilters,
  sortApplications,
} from "./application-filters";

const make = (over: Partial<TrackedApplication>): TrackedApplication => ({
  id: "id",
  openingId: "opening",
  company: "Acme",
  title: "Engineer",
  status: "applied",
  external: false,
  statusChangedAt: new Date("2026-01-01"),
  lastActivityAt: new Date("2026-01-01"),
  appliedAt: new Date("2026-01-01"),
  source: null,
  applicationType: null,
  nextStep: null,
  fitBand: null,
  nextEvent: null,
  ...over,
});

const rows = [
  make({ id: "a", company: "Zeta", lastActivityAt: new Date("2026-03-01") }),
  make({
    id: "b",
    company: "Álamo",
    status: "in_preparation",
    appliedAt: null,
    applicationType: "external",
    lastActivityAt: new Date("2026-02-01"),
  }),
  make({
    id: "c",
    company: "Beta",
    status: "offer",
    applicationType: "simplified",
    appliedAt: new Date("2026-02-15"),
    lastActivityAt: new Date("2026-01-10"),
  }),
];
const ids = (list: TrackedApplication[]) => list.map((row) => row.id);

describe("filterApplications", () => {
  it("keeps everything by default", () => {
    expect(filterApplications(rows, defaultFilters)).toHaveLength(3);
  });

  it("filters by status, type and sent", () => {
    expect(
      ids(filterApplications(rows, { ...defaultFilters, statuses: ["offer"] }))
    ).toEqual(["c"]);
    expect(
      ids(filterApplications(rows, { ...defaultFilters, type: "external" }))
    ).toEqual(["b"]);
    expect(
      ids(filterApplications(rows, { ...defaultFilters, sent: "not_sent" }))
    ).toEqual(["b"]);
    expect(
      ids(filterApplications(rows, { ...defaultFilters, sent: "sent" }))
    ).toEqual(["a", "c"]);
  });

  it("searches the company ignoring case and accents", () => {
    expect(
      ids(filterApplications(rows, { ...defaultFilters, company: "alamo" }))
    ).toEqual(["b"]);
  });
});

describe("sortApplications", () => {
  it("sorts by last activity, newest first", () => {
    expect(ids(sortApplications(rows, "activity"))).toEqual(["a", "b", "c"]);
  });

  it("sorts by sent date with the unsent last", () => {
    expect(ids(sortApplications(rows, "sent"))).toEqual(["c", "a", "b"]);
  });

  it("sorts by company and by funnel status", () => {
    expect(ids(sortApplications(rows, "company"))).toEqual(["b", "c", "a"]);
    expect(ids(sortApplications(rows, "status"))).toEqual(["b", "a", "c"]);
  });

  it("does not change its input", () => {
    sortApplications(rows, "company");
    expect(ids(rows)).toEqual(["a", "b", "c"]);
  });
});

describe("filters in the URL", () => {
  it("round-trips and drops the defaults", () => {
    const filters = {
      statuses: ["applied", "offer"] as const,
      type: "external" as const,
      company: "ac",
      sent: "sent" as const,
      sort: "company" as const,
    };
    const value = { ...filters, statuses: [...filters.statuses] };
    const params = new URLSearchParams(filtersToParams(value));
    expect(parseFilters(params)).toEqual(value);
    expect(filtersToParams(defaultFilters)).toEqual({});
  });

  it("ignores unknown values", () => {
    const params = new URLSearchParams("status=x,applied&type=y&sent=z&sort=q");
    expect(parseFilters(params)).toEqual({
      ...defaultFilters,
      statuses: ["applied"],
    });
  });
});

describe("daysSince", () => {
  it("counts whole days and never goes negative", () => {
    const now = new Date("2026-01-11T10:00:00Z");
    expect(daysSince(new Date("2026-01-01T12:00:00Z"), now)).toBe(9);
    expect(daysSince(new Date("2026-02-01"), now)).toBe(0);
  });
});
