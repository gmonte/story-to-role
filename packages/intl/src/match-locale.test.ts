import { describe, expect, it } from "vitest";

import { matchLocale } from "./match-locale";

describe("matchLocale", () => {
  it("falls back to defaultLocale when no requested locales provided", () => {
    expect(matchLocale([])).toBe("en-US");
  });

  it("matches a supported locale", () => {
    expect(matchLocale(["pt-BR"])).toBe("pt-BR");
  });

  it("strips the wildcard and falls back to defaultLocale", () => {
    expect(matchLocale(["*"])).toBe("en-US");
  });
});
