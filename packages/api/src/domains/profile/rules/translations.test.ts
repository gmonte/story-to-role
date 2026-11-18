import { describe, expect, it } from "vitest";

import { parseBlocks } from "../truth/blocks";
import { readStructure, sectionOf } from "../truth/structure";
import {
  isTranslationOf,
  parseTranslations,
  translateField,
  translationValues,
} from "./translations";

const rules = (lines: string[]) =>
  `# Perfil\n\n## Regras de comunicação\n\n${lines.join("\n")}\n`;

describe("the translations dictionary", () => {
  it("parses entries written inline or as sub-items, by target language", () => {
    const blocks = parseBlocks(
      rules([
        "- Nunca incluir: dados bancários",
        "- Em inglês: Belo Horizonte, MG, Brasil → Belo Horizonte, MG, Brazil; Meta IT (agora Insi) -> Meta IT (now Insi)",
        "- Em português:",
        "  - Something → Alguma coisa",
      ])
    );
    const section = sectionOf(readStructure(blocks), "rules")!;
    const values = translationValues(blocks, section);
    expect(values.map((row) => row.language)).toEqual(["en-US", "pt-BR"]);
    expect(parseTranslations(values[0].value)).toEqual({
      entries: [
        {
          original: "Belo Horizonte, MG, Brasil",
          translation: "Belo Horizonte, MG, Brazil",
        },
        { original: "Meta IT (agora Insi)", translation: "Meta IT (now Insi)" },
      ],
      malformed: [],
    });
    expect(parseTranslations(values[1].value).entries).toEqual([
      { original: "Something", translation: "Alguma coisa" },
    ]);
  });

  it("recognizes the English profile's labels", () => {
    const blocks = parseBlocks(
      `# Profile\n\n## Communication rules\n\n- In Portuguese:\n  - Bachelor's in Information Systems → Bacharelado em Sistemas de Informação\n- In English: x → y\n`
    );
    const section = sectionOf(readStructure(blocks), "rules")!;
    expect(
      translationValues(blocks, section).map((row) => row.language)
    ).toEqual(["pt-BR", "en-US"]);
  });

  it("reports an entry missing a side", () => {
    expect(parseTranslations("Banco X →; a → b").malformed).toEqual([
      "Banco X →",
    ]);
  });

  it("translates a whole field, case-insensitively, and nothing else", () => {
    const entries = parseTranslations(
      "Meta IT (agora Insi) → Meta IT (now Insi); Bacharelado em Sistemas de Informação → Bachelor's in Information Systems"
    ).entries;
    expect(translateField(entries, "meta it (agora insi)")).toBe(
      "Meta IT (now Insi)"
    );
    expect(translateField(entries, "  Meta IT   (agora Insi) ")).toBe(
      "Meta IT (now Insi)"
    );
    // A part of a field is not the field: wording is never patched inside.
    expect(translateField(entries, "Meta IT (agora Insi) e outros")).toBe(
      "Meta IT (agora Insi) e outros"
    );
    expect(translateField(entries, "Globex")).toBe("Globex");
    expect(isTranslationOf(entries, "Bachelor's in Information Systems")).toBe(
      true
    );
    expect(isTranslationOf(entries, "Globex")).toBe(false);
  });
});
