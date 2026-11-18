import { describe, expect, it } from "vitest";

import { createNeverIncludeFilter } from "./never-include-filter";

const filter = createNeverIncludeFilter([
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

describe("never-include filter", () => {
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

  it("matches whole words and figures only, never inside ids or numbers", () => {
    const strict = createNeverIncludeFilter([
      { original: "4", choice: "generalize", generalized: "several" },
      { original: "Rio", choice: "exclude" },
      { original: "30%", choice: "generalize", generalized: "a third" },
    ]);
    expect(
      strict.apply(
        "evidence 7b441bc9 in 2024: 4 people in Rio, Mario, 130% and 30%."
      )
    ).toBe(
      "evidence 7b441bc9 in 2024: several people in [omitted], Mario, 130% and a third."
    );
    expect(
      strict.findForbiddenTerms("Grew 40% with 14 engineers in Rioja")
    ).toEqual([]);
    expect(strict.findForbiddenTerms("Led 4 engineers")).toEqual(["4"]);
    // A figure with a unit, and a name in the plural, still match.
    const units = createNeverIncludeFilter([
      { original: "1.5", choice: "generalize", generalized: "millions" },
      { original: "Acme", choice: "exclude" },
    ]);
    expect(units.apply("Saved 1.5M at Acme's plants; Acmes")).toBe(
      "Saved millionsM at [omitted]'s plants; [omitted]s"
    );
    expect(units.findForbiddenTerms("Saved 21.5M at AcmeCorp")).toEqual([]);
  });
});

describe("public names", () => {
  const named = createNeverIncludeFilter([], {
    publicNames: [
      { original: "Projeto Fênix", public: "plataforma de pagamentos" },
      { original: "Banco X", public: "banco de varejo" },
    ],
  });

  it("finds an original in an output, ignoring case and accents, without rewriting prompts", () => {
    expect(
      named
        .mentionedPublicNames("Liderei o projeto fenix no Banco Xavier.")
        .map((name) => name.original)
    ).toEqual(["Projeto Fênix"]);
    expect(
      named
        .mentionedPublicNames("Liderei o Projeto Fenix no banco x.")
        .map((name) => name.original)
    ).toEqual(["Projeto Fênix", "Banco X"]);
    expect(named.apply("Projeto Fênix")).toBe("Projeto Fênix");
  });
});
