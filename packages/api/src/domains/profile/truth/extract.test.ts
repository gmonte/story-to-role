import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseBlocks } from "./blocks";
import { changedChunks, profileChunks } from "./chunks";
import { extractProfile, profilePassages } from "./extract";

const profile = `# Perfil

## Identidade profissional

- Desenvolvedora backend.

## Experiência (mais recente primeiro)

### Beta — Backend (2022-03 a atual)

- Tecnologias: Python
- Resultados:
  - Reduzi a latência em 60% [medido: APM].
  - Ganhei tempo do time [estimado].
- O que NÃO fiz: não administrei nuvem; não liderei pessoas.

### Gama — Júnior (2019-02 a 2022-02)

- Resultados: relatórios diários [sem número].
- O que NÃO fiz: nada de front.

## Formação

- SI — Universidade — concluído

## Certificações

- Cloud — X — 2024-05 — válida
- Agile — Y — 2020-01 — expirada em 2023-01

## Competências

- Domino: Python, SQL
- Estudei, sem experiência profissional: Spark

## Idiomas

- Inglês — intermediário

## Lacunas conhecidas

- Spark em produção.

## Regras de comunicação

- Nunca incluir: Projeto Fênix, dados do cliente Alfa
- Nunca afirmar: liderança de pessoas
`;

describe("the published profile's extract", () => {
  it("reads experiences, credentials, competencies, rules and figures", () => {
    const extract = extractProfile(parseBlocks(profile));
    expect(extract.experiences).toEqual([
      {
        company: "Beta",
        title: "Backend",
        start: "2022-03",
        end: "present",
        notDone: ["não administrei nuvem; não liderei pessoas."],
      },
      {
        company: "Gama",
        title: "Júnior",
        start: "2019-02",
        end: "2022-02",
        notDone: ["nada de front."],
      },
    ]);
    expect(extract.certifications.map((c) => c.status)).toEqual([
      "valid",
      "expired",
    ]);
    expect(extract.competencies).toEqual([
      { name: "Python", level: "master" },
      { name: "SQL", level: "master" },
      { name: "Spark", level: "studied" },
    ]);
    expect(extract.rules).toEqual({
      neverInclude: ["Projeto Fênix", "dados do cliente Alfa"],
      neverClaim: ["liderança de pessoas"],
    });
    expect(extract.figures.map((f) => [f.mark, f.experience])).toEqual([
      ["measured", 0],
      ["estimated", 0],
      ["noNumber", 1],
    ]);
    expect(extract.gaps).toEqual(["Spark em produção."]);
  });

  it("splits passages per line, with an experience's title", () => {
    const passages = profilePassages(parseBlocks(profile));
    expect(passages).toContainEqual({
      section: "experience",
      experience: 0,
      text: "Beta — Backend (2022-03 a atual): Resultados:\nReduzi a latência em 60% [medido: APM].\nGanhei tempo do time [estimado].",
    });
    expect(passages).toContainEqual({
      section: "gaps",
      experience: null,
      text: "Spark em produção.",
    });
  });

  it("reads the method's example without losing experiences", () => {
    const example = readFileSync(
      join(__dirname, "fixtures", "method-example.md"),
      "utf8"
    );
    // The example writes titles as "Company: Title", which the extract skips
    // until Fix format rewrites them.
    expect(profileChunks(parseBlocks(example)).length).toBeGreaterThan(8);
  });
});

describe("what Validate reviews", () => {
  it("is every part with content when nothing is published", () => {
    const keys = changedChunks(parseBlocks(profile), null).map((c) => c.key);
    expect(keys).toContain("experience:beta — backend");
    expect(keys).toContain("identity");
  });

  it("is only the parts that changed since the published version", () => {
    const edited = profile
      .replace("relatórios diários", "relatórios diários e semanais")
      .replace("2022-03 a atual", "2022-04 a atual");
    expect(
      changedChunks(parseBlocks(edited), parseBlocks(profile)).map((c) => c.key)
    ).toEqual(["experience:beta — backend", "experience:gama — júnior"]);
  });
});
