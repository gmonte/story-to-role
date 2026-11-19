import { describe, expect, it } from "vitest";

import { proficiencyLabel, proficiencyOf } from "./linkedin-proficiency";

describe("LinkedIn's language proficiency", () => {
  it("reads CEFR codes and level words in Portuguese and English", () => {
    expect(proficiencyOf("A2")).toBe("elementary");
    expect(proficiencyOf("básico")).toBe("elementary");
    expect(proficiencyOf("intermediário (B1)")).toBe("limited_working");
    expect(proficiencyOf("intermediate")).toBe("limited_working");
    expect(proficiencyOf("avançado")).toBe("professional_working");
    expect(proficiencyOf("B2")).toBe("professional_working");
    expect(proficiencyOf("fluente (C1)")).toBe("full_professional");
    expect(proficiencyOf("fluent")).toBe("full_professional");
    expect(proficiencyOf("C2")).toBe("full_professional");
    expect(proficiencyOf("nativo")).toBe("native_or_bilingual");
    expect(proficiencyOf("Native")).toBe("native_or_bilingual");
    expect(proficiencyOf("bilíngue")).toBe("native_or_bilingual");
  });

  it("leaves a level it can't read for the user to pick", () => {
    expect(proficiencyOf("conversação")).toBeNull();
    expect(proficiencyOf(null)).toBeNull();
  });

  it("names each level as LinkedIn does in the output language", () => {
    expect(proficiencyLabel("full_professional", "en-US")).toBe(
      "Full professional proficiency"
    );
    expect(proficiencyLabel("native_or_bilingual", "pt-BR")).toBe(
      "Proficiência nativa ou bilíngue"
    );
  });
});
