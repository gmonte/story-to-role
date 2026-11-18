import { describe, expect, it } from "vitest";

import { translateLanguageTerm } from "./language-terms";

describe("the built-in dictionary of language names and levels", () => {
  it("translates names and level words into English, keeping CEFR codes", () => {
    expect(translateLanguageTerm("Português", "en-US")).toBe("Portuguese");
    expect(translateLanguageTerm("nativo", "en-US")).toBe("native");
    expect(translateLanguageTerm("Português (nativo)", "en-US")).toBe(
      "Portuguese (native)"
    );
    expect(translateLanguageTerm("fluente (C1)", "en-US")).toBe("fluent (C1)");
    expect(translateLanguageTerm("Intermediário", "en-US")).toBe(
      "Intermediate"
    );
    expect(translateLanguageTerm("Inglês — avançado", "en-US")).toBe(
      "English — advanced"
    );
  });

  it("translates a known phrase whole, else word by word", () => {
    expect(
      translateLanguageTerm("proficiência profissional completa", "en-US")
    ).toBe("full professional proficiency");
    expect(
      translateLanguageTerm("leitura técnica e conversação", "en-US")
    ).toBe("technical reading and conversation");
    expect(translateLanguageTerm("Espanhol, básico", "en-US")).toBe(
      "Spanish, basic"
    );
  });

  it("translates into Brazilian Portuguese as well", () => {
    expect(translateLanguageTerm("English", "pt-BR")).toBe("Inglês");
    expect(translateLanguageTerm("native", "pt-BR")).toBe("nativo");
    expect(translateLanguageTerm("Spanish (intermediate)", "pt-BR")).toBe(
      "Espanhol (intermediário)"
    );
    expect(
      translateLanguageTerm("full professional proficiency", "pt-BR")
    ).toBe("proficiência profissional completa");
    expect(translateLanguageTerm("reading and writing", "pt-BR")).toBe(
      "leitura e escrita"
    );
    expect(translateLanguageTerm("valid", "pt-BR")).toBe("válida");
    expect(translateLanguageTerm("in progress", "pt-BR")).toBe("em andamento");
  });

  it("leaves unknown words, codes and a school's name as written", () => {
    expect(translateLanguageTerm("C1", "en-US")).toBe("C1");
    expect(translateLanguageTerm("TOEFL 110", "pt-BR")).toBe("TOEFL 110");
    expect(translateLanguageTerm("fluente (Cultura Inglesa)", "en-US")).toBe(
      "fluent (Cultura Inglesa)"
    );
    expect(translateLanguageTerm("", "en-US")).toBe("");
  });
});
