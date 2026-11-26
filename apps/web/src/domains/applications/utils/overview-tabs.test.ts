import { describe, expect, it } from "vitest";

import { overviewTabHref } from "./overview-tabs";

describe("overviewTabHref", () => {
  it("carries the filter from Tracking to Calendar, without the view", () => {
    const params = new URLSearchParams("view=kanban&status=applied&q=acme");
    expect(overviewTabHref("calendar", params, "tracking")).toBe(
      "/app/openings/calendar?status=applied&q=acme"
    );
  });

  it("carries the filter from Calendar to Tracking, without the month", () => {
    const params = new URLSearchParams("month=2026-11&show=timeline&fit=high");
    expect(overviewTabHref("tracking", params, "calendar")).toBe(
      "/app/openings?fit=high"
    );
  });

  it("keeps the current tab's own query on its own link", () => {
    const params = new URLSearchParams("view=kanban");
    expect(overviewTabHref("tracking", params, "tracking")).toBe(
      "/app/openings?view=kanban"
    );
  });

  it("gives Metrics and Settings no query", () => {
    const params = new URLSearchParams("status=applied");
    expect(overviewTabHref("metrics", params, "tracking")).toBe(
      "/app/openings/metrics"
    );
    expect(overviewTabHref("settings", params, "tracking")).toBe(
      "/app/openings/settings"
    );
  });

  it("brings the filter back from Metrics", () => {
    const params = new URLSearchParams("status=applied");
    expect(overviewTabHref("tracking", params, "metrics")).toBe(
      "/app/openings?status=applied"
    );
  });
});
