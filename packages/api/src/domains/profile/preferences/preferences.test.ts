import { describe, expect, it } from "vitest";

import { parseBlocks, serializeBlocks } from "../truth/blocks";
import {
  addPreference,
  extractPreferences,
  fixPreferencesFormat,
  isExcludedCompany,
  lintPreferences,
  preferencesTemplate,
} from "./preferences";

const preferences = `# Preferências de vaga

## Modelo de trabalho

- Aceito: remoto, híbrido

## Locais aceitos

- Belo Horizonte, MG
- Presencial só na minha cidade.

## Faixa salarial

- Mínimo: R$ 12.000 CLT
- Desejado:

## Empresas excluídas

- Empresa A (2026-10-02): motivo pessoal.
- Banco Alfa

## Setores excluídos

- Apostas

## Regras de descarte

- Contato só por aplicativo de mensagens.
`;

describe("the job preferences document", () => {
  it("starts from a template that follows its own format", () => {
    for (const language of ["pt-BR", "en-US"] as const) {
      const findings = lintPreferences(preferencesTemplate(language));
      expect(findings.filter((f) => f.kind === "format")).toEqual([]);
    }
  });

  it("reads what screening needs", () => {
    expect(extractPreferences(parseBlocks(preferences))).toEqual({
      workModels: ["remote", "hybrid"],
      locations: ["Belo Horizonte, MG", "Presencial só na minha cidade."],
      salary: ["Mínimo: R$ 12.000 CLT"],
      excludedCompanies: ["Empresa A", "Banco Alfa"],
      excludedSectors: ["Apostas"],
      discardRules: ["Contato só por aplicativo de mensagens."],
    });
  });

  it("marks a missing section, and Fix format puts it back in order", () => {
    const broken = parseBlocks(
      preferences.replace("## Setores excluídos\n\n- Apostas\n\n", "")
    );
    expect(lintPreferences(broken).map((f) => f.code)).toEqual([
      "missingSection",
    ]);
    const fixed = fixPreferencesFormat(broken);
    expect(lintPreferences(fixed)).toEqual([]);
    expect(serializeBlocks(fixed)).toContain(
      "- Banco Alfa\n\n## Setores excluídos\n\n## Regras de descarte"
    );
  });

  it("marks a work model it can't read", () => {
    const vague = parseBlocks(
      preferences.replace("remoto, híbrido", "tanto faz")
    );
    expect(lintPreferences(vague).map((f) => [f.code, f.kind])).toEqual([
      ["workModelUnknown", "content"],
    ]);
  });

  it("adds an excluded company once, with its date", () => {
    const blocks = parseBlocks(preferences);
    const added = addPreference(blocks, {
      section: "excludedCompanies",
      company: "Gama Tech",
      date: "2026-11-17",
    });
    expect(serializeBlocks(added)).toContain(
      "- Banco Alfa\n- Gama Tech (2026-11-17)\n\n## Setores excluídos"
    );
    expect(
      addPreference(added, {
        section: "excludedCompanies",
        company: "gama tech",
        date: "2026-11-18",
      })
    ).toEqual(added);
  });

  it("knows an excluded company by its name, either way", () => {
    const extract = extractPreferences(parseBlocks(preferences));
    expect(isExcludedCompany(extract, "Banco Alfa S.A.")).toBe("Banco Alfa");
    expect(isExcludedCompany(extract, "empresa a")).toBe("Empresa A");
    expect(isExcludedCompany(extract, "Empresa Beta")).toBeNull();
    expect(isExcludedCompany(extract, null)).toBeNull();
  });

  it("never takes a part of a word for an excluded company", () => {
    const extract = extractPreferences(
      parseBlocks(
        preferences.replace(
          "- Banco Alfa",
          "- Oi\n- Meta (2026-01-10): layoffs\n- Re:amaze\n- Banco Alfa"
        )
      )
    );
    expect(extract.excludedCompanies).toEqual(
      expect.arrayContaining(["Oi", "Meta", "Re:amaze"])
    );
    expect(isExcludedCompany(extract, "Deloitte")).toBeNull();
    expect(isExcludedCompany(extract, "Metabase")).toBeNull();
    expect(isExcludedCompany(extract, "Red Hat")).toBeNull();
    expect(isExcludedCompany(extract, "Oi Fibra")).toBe("Oi");
    expect(isExcludedCompany(extract, "Meta Platforms")).toBe("Meta");
  });

  it("doesn't accept a work model the line refuses", () => {
    const extract = extractPreferences(
      parseBlocks(
        preferences.replace(
          /- Aceito:.*/,
          "- Aceito: remoto e híbrido. Não aceito presencial."
        )
      )
    );
    expect(extract.workModels).toEqual(["remote", "hybrid"]);
  });
});
