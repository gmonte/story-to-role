import { describe, expect, it } from "vitest";

import { isServerRuntime } from "./is-server-runtime";

describe("isServerRuntime", () => {
  it("returns true when window is undefined", () => {
    expect(isServerRuntime()).toBe(true);
  });
});
