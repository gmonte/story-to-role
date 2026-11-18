import { describe, expect, it } from "vitest";

import { withoutLineIds } from "./line-ids";

describe("withoutLineIds", () => {
  it("drops the short line ids the agent may echo", () => {
    expect(
      withoutLineIds(
        "O resumo (fb39afba) se apoia no bullet [329e6c55] da experiência."
      )
    ).toBe("O resumo se apoia no bullet da experiência.");
  });

  it("keeps ordinary brackets", () => {
    expect(withoutLineIds("Números [medido] e (2022)")).toBe(
      "Números [medido] e (2022)"
    );
  });
});
