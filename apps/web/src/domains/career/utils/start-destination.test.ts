import { describe, expect, it } from "vitest";

import { startDestination } from "./start-destination";

const state = {
  path: null,
  hasStarted: false,
  hasOpening: false,
  hasPublishedProfile: false,
};

describe("startDestination", () => {
  it("asks a new user to choose", () => {
    expect(startDestination(state)).toBeNull();
  });

  it("resumes the guided opening path until its first opening", () => {
    expect(startDestination({ ...state, path: "opening" })).toBe(
      "/app/start/opening"
    );
  });

  it("opens My career until the profile is published", () => {
    expect(startDestination({ ...state, hasStarted: true })).toBe(
      "/app/career"
    );
  });

  it("opens the Openings page once the profile is published", () => {
    expect(
      startDestination({
        ...state,
        path: "opening",
        hasOpening: true,
        hasPublishedProfile: true,
      })
    ).toBe("/app/openings");
  });
});
