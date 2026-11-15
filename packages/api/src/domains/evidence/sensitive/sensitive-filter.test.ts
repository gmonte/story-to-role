import { describe, expect, it } from "vitest";

import { createSensitiveFilter } from "./sensitive-filter";

const filter = createSensitiveFilter([
  {
    original: "Banco X",
    choice: "generalize",
    generalized: "the largest private bank in the country",
  },
  { original: "Project Phoenix", choice: "exclude" },
  { original: "Acme", choice: "use" },
  // Not reviewed yet: treated like generalize-without-text, so it is hidden.
  { original: "R$ 12 million", choice: null },
]);

describe("sensitive filter", () => {
  it("replaces generalized items, hides excluded ones and keeps used ones", () => {
    expect(
      filter.apply(
        "At Banco X I led Project Phoenix with Acme, saving R$ 12 million."
      )
    ).toBe(
      "At the largest private bank in the country I led [omitted] with Acme, saving [omitted]."
    );
  });

  it("matches regardless of case and accents", () => {
    expect(filter.apply("worked at BANCO X")).toBe(
      "worked at the largest private bank in the country"
    );
  });

  it("drops facts that make no sense without an excluded item", () => {
    expect(
      filter.dropFactsMentioningExcluded([
        "Launched Project Phoenix in 3 months",
        "Mentored 4 engineers",
      ])
    ).toEqual(["Mentored 4 engineers"]);
  });

  it("finds generalized and excluded originals in an output", () => {
    expect(
      filter.findForbiddenTerms(
        "Delivered project phoenix for Banco X and Acme"
      )
    ).toEqual(["Banco X", "Project Phoenix"]);
    expect(filter.findForbiddenTerms("Mentored 4 engineers at Acme")).toEqual(
      []
    );
  });

  it("rejects an output containing a forbidden term", () => {
    expect(() => filter.assertClean("Saved R$ 12 million")).toThrow(
      "forbidden term"
    );
    expect(() => filter.assertClean("Saved eight figures")).not.toThrow();
  });
});
