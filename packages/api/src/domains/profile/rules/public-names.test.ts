import { describe, expect, it } from "vitest";

import { parsePublicNames } from "./public-names";

describe("public names", () => {
  it("reads entries split on semicolons with any arrow", () => {
    const { entries, malformed } = parsePublicNames(
      "Projeto Fênix → plataforma de pagamentos; Banco X -> banco de varejo; Acme, Inc => a startup."
    );
    expect(malformed).toEqual([]);
    expect(entries).toEqual([
      { original: "Projeto Fênix", public: "plataforma de pagamentos" },
      { original: "Banco X", public: "banco de varejo" },
      { original: "Acme, Inc", public: "a startup" },
    ]);
  });

  it("returns a half-written entry apart", () => {
    const { entries, malformed } = parsePublicNames("Banco X →; Foo; A → B");
    expect(entries).toEqual([{ original: "A", public: "B" }]);
    expect(malformed).toEqual(["Banco X →", "Foo"]);
  });
});
