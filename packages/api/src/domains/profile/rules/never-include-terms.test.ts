import { describe, expect, it } from "vitest";

import {
  neverIncludeCategories,
  neverIncludeTerms,
  splitNeverIncludeItems,
} from "./never-include-terms";

describe("never-include items", () => {
  it("treats the default rule as categories only", () => {
    const items = splitNeverIncludeItems(
      "documentos de identidade, dados bancários, endereço residencial; nomes internos de repositórios e projetos."
    );
    expect(items).toHaveLength(4);
    expect(neverIncludeTerms(items)).toEqual([]);
    expect(neverIncludeCategories(items)).toContain(
      "nomes internos de repositórios e projetos"
    );
  });

  it("reads names, figures and quoted text as literal terms", () => {
    const items = splitNeverIncludeItems(
      "Banco X, salário de 2024, “Projeto Fênix”"
    );
    expect(neverIncludeTerms(items)).toEqual([
      "Banco X",
      "salário de 2024",
      "Projeto Fênix",
    ]);
  });

  it("treats a quoted lowercase word as a term and keeps commas in quotes", () => {
    const items = splitNeverIncludeItems('"fênix", “a, b”');
    expect(neverIncludeTerms(items)).toEqual(["fênix", "a, b"]);
  });
});
