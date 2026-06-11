import { describe, expect, it } from "vitest";

import { getDbPrefix } from "./get-db-prefix";

describe("getDbPrefix", () => {
  it("returns a string", () => {
    expect(typeof getDbPrefix()).toBe("string");
  });
});
