import { describe, expect, it } from "vitest";

import { printedFields } from "./printed-fields";
import { looksWrittenIn } from "./untranslated";

const portuguese = {
  "en-US": [
    { original: "Meta IT (agora Insi)", translation: "Meta IT (now Insi)" },
    {
      original: "Bacharelado em Sistemas de Informação",
      translation: "Bachelor's in Information Systems",
    },
    {
      original: "Belo Horizonte, MG, Brasil",
      translation: "Belo Horizonte, MG, Brazil",
    },
  ],
};

describe("code-printed fields in the document's language", () => {
  it("prints a Portuguese profile's fields in English through the dictionary", () => {
    const printing = printedFields({
      profileLanguage: "pt-BR",
      language: "en-US",
      translations: portuguese,
    });
    expect(printing.active).toBe(true);
    expect(printing.field("Meta IT (agora Insi)")).toBe("Meta IT (now Insi)");
    expect(printing.field("Bacharelado em Sistemas de Informação")).toBe(
      "Bachelor's in Information Systems"
    );
    expect(printing.field("Belo Horizonte, MG, Brasil")).toBe(
      "Belo Horizonte, MG, Brazil"
    );
    // Not in the dictionary: as written, for the finding to point out.
    expect(printing.field("Universidade Federal de Minas Gerais")).toBe(
      "Universidade Federal de Minas Gerais"
    );
    // Languages go through the built-in dictionary, then the profile's.
    expect(printing.languageTerm("Português")).toBe("Portuguese");
    expect(printing.languageTerm("nativo")).toBe("native");
    expect(printing.nullableLanguageTerm("fluente (C1)")).toBe("fluent (C1)");
    expect(printing.nullableLanguageTerm(null)).toBeNull();
  });

  it("prints an English profile's fields in Portuguese the same way", () => {
    const printing = printedFields({
      profileLanguage: "en-US",
      language: "pt-BR",
      translations: {
        "pt-BR": [
          {
            original: "Globex (now Initech)",
            translation: "Globex (agora Initech)",
          },
        ],
      },
    });
    expect(printing.field("Globex (now Initech)")).toBe(
      "Globex (agora Initech)"
    );
    expect(printing.languageTerm("English")).toBe("Inglês");
    expect(printing.languageTerm("native")).toBe("nativo");
    expect(printing.languageTerm("valid")).toBe("válida");
  });

  it("changes nothing in the profile's own language or with no profile", () => {
    const same = printedFields({
      profileLanguage: "pt-BR",
      language: "pt-BR",
      translations: portuguese,
    });
    expect(same.active).toBe(false);
    expect(same.dictionary).toEqual([]);
    expect(same.field("Meta IT (agora Insi)")).toBe("Meta IT (agora Insi)");
    expect(same.languageTerm("Inglês")).toBe("Inglês");
    const none = printedFields({
      profileLanguage: null,
      language: "en-US",
      translations: {},
    });
    expect(none.languageTerm("Português")).toBe("Português");
  });
});

describe("a field that reads as the profile's language", () => {
  it("tells Portuguese by its function words and known phrases", () => {
    expect(looksWrittenIn("Meta IT (agora Insi)", "pt-BR")).toBe(true);
    expect(
      looksWrittenIn("Bacharelado em Sistemas de Informação", "pt-BR")
    ).toBe(true);
    expect(looksWrittenIn("Belo Horizonte, MG, Brasil", "pt-BR")).toBe(true);
    expect(looksWrittenIn("Português (nativo)", "pt-BR")).toBe(true);
    expect(looksWrittenIn("Engenheira de Software Sênior", "pt-BR")).toBe(true);
  });

  it("tells English the same way", () => {
    expect(looksWrittenIn("Globex (now Initech)", "en-US")).toBe(true);
    expect(looksWrittenIn("Bachelor's in Information Systems", "en-US")).toBe(
      true
    );
    expect(looksWrittenIn("Federal University of Minas Gerais", "en-US")).toBe(
      true
    );
    expect(looksWrittenIn("Senior Software Engineer", "en-US")).toBe(true);
  });

  it("never points at a proper noun, a code or the other language", () => {
    expect(looksWrittenIn("Globex", "pt-BR")).toBe(false);
    expect(looksWrittenIn("São Paulo, SP", "pt-BR")).toBe(false);
    expect(looksWrittenIn("C1", "pt-BR")).toBe(false);
    expect(looksWrittenIn("Meta IT (now Insi)", "pt-BR")).toBe(false);
    expect(looksWrittenIn("Bachelor's in Information Systems", "pt-BR")).toBe(
      false
    );
    expect(looksWrittenIn("Globex (agora Initech)", "en-US")).toBe(false);
    // A word of both languages tells nothing.
    expect(looksWrittenIn("MBA Federal", "pt-BR")).toBe(false);
  });
});
