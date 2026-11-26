import { describe, expect, it } from "vitest";

import type { TrackerSettings } from "../schemas/tracker";
import {
  calendarMarkers,
  dayIn,
  milestonesOf,
  type CalendarOpening,
} from "./calendar";

const settings: TrackerSettings = {
  remindersEnabled: true,
  followUpDays: 10,
  noResponseDays: 30,
};
const now = new Date("2026-11-20T12:00:00Z");
const at = (iso: string) => new Date(iso);

const opening = (over: Partial<CalendarOpening> = {}): CalendarOpening => ({
  openingId: "00000000-0000-4000-8000-000000000001",
  company: "Acme",
  title: "Engineer",
  status: "analyzed",
  addedAt: at("2026-11-05T13:00:00Z"),
  application: null,
  ...over,
});

const markers = (
  openings: CalendarOpening[],
  over: {
    show?: "latest" | "timeline";
    from?: string;
    to?: string;
    timeZone?: string;
  } = {}
) =>
  calendarMarkers({
    openings,
    from: over.from ?? "2026-11-01",
    to: over.to ?? "2026-11-30",
    timeZone: over.timeZone ?? "America/Sao_Paulo",
    show: over.show ?? "timeline",
    settings,
    now,
  });

describe("milestonesOf", () => {
  it("projects the follow-up and No response only ahead", () => {
    const applied = opening({
      application: {
        status: "applied",
        appliedAt: at("2026-11-15T12:00:00Z"),
        lastActivityAt: at("2026-11-15T12:00:00Z"),
        events: [],
      },
    });
    expect(
      milestonesOf(applied, settings, now).map((m) => [m.kind, m.projected])
    ).toEqual([
      ["added", false],
      ["applied", false],
      ["follow_up", true],
      ["no_response", true],
    ]);
    // Ten days later the follow-up is behind: only No response is ahead.
    const later = new Date("2026-11-26T12:00:00Z");
    expect(milestonesOf(applied, settings, later).map((m) => m.kind)).toEqual([
      "added",
      "applied",
      "no_response",
    ]);
    expect(
      milestonesOf(applied, { ...settings, remindersEnabled: false }, now).map(
        (m) => m.kind
      )
    ).not.toContain("follow_up");
  });

  it("keeps status changes and notes, applying once", () => {
    const moved = opening({
      application: {
        status: "in_process",
        appliedAt: at("2026-11-06T12:00:00Z"),
        lastActivityAt: at("2026-11-10T12:00:00Z"),
        events: [
          {
            kind: "status_change",
            occurredAt: at("2026-11-06T12:00:00Z"),
            text: null,
            toStatus: "applied",
          },
          {
            kind: "status_change",
            occurredAt: at("2026-11-10T12:00:00Z"),
            text: null,
            toStatus: "in_process",
          },
          {
            kind: "note",
            occurredAt: at("2026-11-27T15:00:00Z"),
            text: "HR interview",
            toStatus: null,
          },
        ],
      },
    });
    expect(
      milestonesOf(moved, settings, now).map(
        (m) => m.status ?? m.text ?? m.kind
      )
    ).toEqual([
      "added",
      "applied",
      "in_process",
      "HR interview",
      "no_response",
    ]);
  });
});

describe("calendarMarkers", () => {
  it("joins a day's milestones under the most advanced one", () => {
    const sameDay = opening({
      application: {
        status: "applied",
        appliedAt: at("2026-11-05T14:00:00Z"),
        lastActivityAt: at("2026-11-05T14:00:00Z"),
        events: [],
      },
    });
    const [marker] = markers([sameDay]);
    expect(marker.day).toBe("2026-11-05");
    expect(marker.lead.kind).toBe("applied");
    expect(marker.milestones.map((m) => m.kind)).toEqual(["added", "applied"]);
  });

  it("lets Opening added lead only a day it has alone", () => {
    expect(markers([opening()]).map((m) => m.lead.kind)).toEqual(["added"]);
  });

  it("lays days out in the viewer's time zone", () => {
    // 01:00 UTC on Dec 1 is still Nov 30 in São Paulo.
    const late = opening({ addedAt: at("2026-12-01T01:00:00Z") });
    expect(markers([late]).map((m) => m.day)).toEqual(["2026-11-30"]);
    expect(markers([late], { timeZone: "UTC" })).toEqual([]);
    expect(dayIn(late.addedAt, "UTC")).toBe("2026-12-01");
  });

  it("takes the days of the weeks around the month, not only its own", () => {
    const early = opening({ addedAt: at("2026-12-02T15:00:00Z") });
    // November's grid runs to Saturday, Dec 5.
    expect(
      markers([early], { from: "2026-11-01", to: "2026-12-05" }).map(
        (m) => m.day
      )
    ).toEqual(["2026-12-02"]);
  });

  it("shows only the next milestone ahead, else the latest, in Latest", () => {
    const interview = opening({
      application: {
        status: "in_process",
        appliedAt: at("2026-11-06T12:00:00Z"),
        lastActivityAt: at("2026-11-10T12:00:00Z"),
        events: [
          {
            kind: "note",
            occurredAt: at("2026-11-27T15:00:00Z"),
            text: "HR interview",
            toStatus: null,
          },
        ],
      },
    });
    const latest = markers([interview], { show: "latest" });
    expect(latest).toHaveLength(1);
    expect(latest[0].lead).toMatchObject({
      kind: "note",
      text: "HR interview",
    });

    const closed = opening({
      application: {
        status: "rejected",
        appliedAt: at("2026-11-06T12:00:00Z"),
        lastActivityAt: at("2026-11-12T12:00:00Z"),
        events: [
          {
            kind: "status_change",
            occurredAt: at("2026-11-12T12:00:00Z"),
            text: null,
            toStatus: "rejected",
          },
        ],
      },
    });
    expect(
      markers([closed], { show: "latest" }).map((m) => m.lead.status)
    ).toEqual(["rejected"]);
    // Its latest milestone is in November: October shows nothing.
    expect(
      markers([closed], {
        show: "latest",
        from: "2026-10-01",
        to: "2026-10-31",
      })
    ).toEqual([]);
  });
});
