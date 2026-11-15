import { describe, expect, it } from "vitest";

import {
  mergeImportedPositions,
  type ImportedPosition,
  type TimelinePosition,
} from "./merge-imported-positions";

const acme: ImportedPosition = {
  employer: "Acme Corp.",
  title: "Senior Engineer",
  startDate: "2020-01",
  endDate: "2023-06",
  location: "São Paulo",
};

describe("merging imported positions into the timeline", () => {
  it("creates a position the timeline doesn't have yet", () => {
    const plan = mergeImportedPositions([], [acme]);

    expect(plan.creates).toEqual([acme]);
    expect(plan.updates).toEqual([]);
  });

  it("matches the same position from two resumes despite employer spelling", () => {
    const existing: TimelinePosition = {
      id: "p1",
      ...acme,
      employer: "ACME Corp",
    };

    const plan = mergeImportedPositions([existing], [{ ...acme }]);

    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([
      { positionId: "p1", imported: acme, conflicts: [], fill: {} },
    ]);
  });

  it("shows conflicting dates and titles side by side instead of choosing", () => {
    const existing: TimelinePosition = { id: "p1", ...acme };

    const plan = mergeImportedPositions(
      [existing],
      [{ ...acme, title: "Staff Engineer", startDate: "2019-11" }]
    );

    expect(plan.creates).toEqual([]);
    expect(plan.updates[0].conflicts).toEqual([
      { field: "title", options: ["Senior Engineer", "Staff Engineer"] },
      { field: "startDate", options: ["2020-01", "2019-11"] },
    ]);
  });

  it("keeps a promotion at the same employer as its own position", () => {
    const existing: TimelinePosition = {
      id: "p1",
      employer: "Acme",
      title: "Engineer",
      startDate: "2017-01",
      endDate: "2019-12",
    };

    const plan = mergeImportedPositions([existing], [acme]);

    expect(plan.creates).toEqual([acme]);
  });

  it("fills facts the timeline lacks without calling them conflicts", () => {
    const existing: TimelinePosition = {
      id: "p1",
      ...acme,
      location: undefined,
      endDate: undefined,
    };

    const plan = mergeImportedPositions([existing], [acme]);

    expect(plan.updates).toEqual([
      {
        positionId: "p1",
        imported: acme,
        conflicts: [{ field: "endDate", options: ["current", "2023-06"] }],
        fill: { location: "São Paulo" },
      },
    ]);
  });

  it("keeps a promotion whose period only touches the previous title", () => {
    const existing: TimelinePosition = {
      id: "p1",
      employer: "Acme",
      title: "Engineer",
      startDate: "2018-01",
      endDate: "2020-01",
    };

    const plan = mergeImportedPositions(
      [existing],
      [{ ...acme, employer: "Acme", startDate: "2020-01" }]
    );

    expect(plan.creates).toHaveLength(1);
  });

  it("matches an undated entry only by title", () => {
    const existing: TimelinePosition = {
      id: "p1",
      employer: "Acme",
      title: "Engineer",
    };

    expect(mergeImportedPositions([existing], [acme]).creates).toEqual([acme]);
    expect(
      mergeImportedPositions(
        [existing],
        [{ employer: "ACME", title: "engineer" }]
      ).updates
    ).toHaveLength(1);
  });

  it("merges duplicates inside one import", () => {
    const plan = mergeImportedPositions([], [acme, { ...acme }]);

    expect(plan.creates).toHaveLength(1);
  });
});
