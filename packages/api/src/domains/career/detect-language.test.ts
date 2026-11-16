import { describe, expect, it } from "vitest";

import { detectLanguage } from "./detect-language";

describe("detectLanguage", () => {
  it("tells Portuguese from English", () => {
    expect(detectLanguage("Eu trabalhei na Acme por três anos")).toBe("pt-BR");
    expect(detectLanguage("I worked at Acme for three years")).toBe("en-US");
  });

  it("says nothing when the message doesn't tell", () => {
    expect(detectLanguage("Acme")).toBeNull();
    expect(detectLanguage("ok")).toBeNull();
  });
});
