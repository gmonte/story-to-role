import { describe, expect, it } from "vitest";

import { topmostNewSuggestion } from "./topmost-new-suggestion";

const at = (id: string, start: number | null) => ({
  id,
  range: start === null ? null : { start },
});

describe("topmostNewSuggestion", () => {
  it("picks the new suggestion nearest the top", () => {
    const result = topmostNewSuggestion(new Set(["a"]), [
      at("a", 1),
      at("b", 9),
      at("c", 4),
    ]);
    expect(result?.id).toBe("c");
  });

  it("ignores old and unlocated suggestions", () => {
    expect(
      topmostNewSuggestion(new Set(["a"]), [at("a", 1), at("b", null)])
    ).toBeNull();
  });
});
