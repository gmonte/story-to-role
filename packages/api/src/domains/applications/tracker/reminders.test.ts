import { describe, expect, it } from "vitest";

import { computeReminders } from "./reminders";

const day = 24 * 3600 * 1000;
const now = new Date("2026-11-20T12:00:00Z");
const settings = {
  remindersEnabled: true,
  followUpDays: 10,
  noResponseDays: 30,
};
const base = {
  id: "a1",
  openingId: "o1",
  company: "Globex",
  title: "Platform Engineer",
  appliedAt: null as Date | null,
  nextEvent: null as { occurredAt: Date; text: string | null } | null,
};

describe("computeReminders", () => {
  it("nudges a follow-up after days without reply", () => {
    const reminders = computeReminders({
      now,
      settings,
      applications: [
        {
          ...base,
          status: "applied",
          appliedAt: new Date(now.getTime() - 12 * day),
          lastActivityAt: new Date(now.getTime() - 12 * day),
        },
      ],
    });
    expect(reminders).toEqual([
      expect.objectContaining({
        kind: "follow_up",
        days: 12,
        key: `follow_up:a1:${new Date(now.getTime() - 12 * day).toISOString()}`,
      }),
    ]);
  });

  it("warns before an application turns No response, instead of the nudge", () => {
    const reminders = computeReminders({
      now,
      settings,
      applications: [
        {
          ...base,
          status: "in_process",
          lastActivityAt: new Date(now.getTime() - 28 * day),
        },
      ],
    });
    expect(reminders).toEqual([
      expect.objectContaining({
        kind: "no_response_soon",
        days: 2,
        date: new Date(now.getTime() + 2 * day),
      }),
    ]);
  });

  it("reminds of a dated event within a day", () => {
    const occurredAt = new Date(now.getTime() + 20 * 3600 * 1000);
    const reminders = computeReminders({
      now,
      settings,
      applications: [
        {
          ...base,
          status: "in_process",
          lastActivityAt: now,
          nextEvent: { occurredAt, text: "HR interview" },
        },
      ],
    });
    expect(reminders).toEqual([
      expect.objectContaining({
        kind: "upcoming_event",
        date: occurredAt,
        text: "HR interview",
        key: `upcoming_event:a1:${occurredAt.toISOString()}`,
      }),
    ]);
  });

  it("says nothing for closed applications, dismissed reminders or when off", () => {
    const stale = {
      ...base,
      status: "applied" as const,
      lastActivityAt: new Date(now.getTime() - 15 * day),
    };
    expect(
      computeReminders({
        now,
        settings,
        applications: [{ ...stale, status: "rejected" }],
      })
    ).toEqual([]);
    expect(
      computeReminders({
        now,
        settings,
        applications: [stale],
        dismissed: [`follow_up:a1:${stale.lastActivityAt.toISOString()}`],
      })
    ).toEqual([]);
    expect(
      computeReminders({
        now,
        settings: { ...settings, remindersEnabled: false },
        applications: [stale],
      })
    ).toEqual([]);
  });
});
