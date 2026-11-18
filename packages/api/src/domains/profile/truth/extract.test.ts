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
- Experiência pontual: Redis
- Estudei, sem experiência profissional: Spark

## Idiomas

- Inglês — intermediário

## Lacunas conhecidas

- Spark em produção.

## Regras de comunicação

- Nunca incluir: Projeto Fênix, dados do cliente Alfa
- Nunca afirmar: liderança de pessoas
- Nomes públicos: Projeto Fênix → plataforma de pagamentos; Banco X -> banco de varejo
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
      { name: "Redis", level: "occasional" },
      { name: "Spark", level: "studied" },
    ]);
    expect(extract.rules).toEqual({
      neverInclude: ["Projeto Fênix", "dados do cliente Alfa"],
      neverClaim: ["liderança de pessoas"],
      publicNames: [
        { original: "Projeto Fênix", public: "plataforma de pagamentos" },
        { original: "Banco X", public: "banco de varejo" },
      ],
    });
    const passages = profilePassages(parseBlocks(profile));
    for (const figure of extract.figures) {
      expect(passages[figure.passage!].text).toContain(figure.text);
    }
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
      kind: "evidence",
      section: "experience",
      lines: [6, 7, 8],
      experience: 0,
      text: "Beta — Backend (2022-03 a atual): Resultados:\nReduzi a latência em 60% [medido: APM].\nGanhei tempo do time [estimado].",
    });
    expect(passages).toContainEqual(
      expect.objectContaining({ section: "gaps", text: "Spark em produção." })
    );
  });

  it("tells evidence from what the profile says is lacking", () => {
    const kinds = Object.fromEntries(
      profilePassages(parseBlocks(profile)).map((passage) => [
        passage.text.split("\n")[0],
        passage.kind,
      ])
    );
    expect(kinds).toMatchObject({
      "Beta — Backend (2022-03 a atual): Tecnologias: Python": "evidence",
      "Beta — Backend (2022-03 a atual): O que NÃO fiz: não administrei nuvem; não liderei pessoas.":
        "notDone",
      "Domino: Python, SQL": "evidence",
      "Experiência pontual: Redis": "evidence",
      "Estudei, sem experiência profissional: Spark": "studied",
      "Spark em produção.": "gap",
      "Nunca incluir: Projeto Fênix, dados do cliente Alfa": "rule",
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
  it("reads public names written one per sub-item", () => {
    const blocks = parseBlocks(
      profile.replace(
        "- Nomes públicos: Projeto Fênix → plataforma de pagamentos; Banco X -> banco de varejo",
        "- Nomes públicos:\n  - Projeto Fênix → plataforma de pagamentos\n  - Banco X -> banco de varejo"
      )
    );
    expect(extractProfile(blocks).rules.publicNames).toEqual([
      { original: "Projeto Fênix", public: "plataforma de pagamentos" },
      { original: "Banco X", public: "banco de varejo" },
    ]);
  });
});

describe("projects", () => {
  const withProjects = `# Perfil

## Experiência (mais recente primeiro)

### Beta — Backend (2022-03 a atual)

- Resultados: entreguei a API [sem número].
- O que NÃO fiz: nada de front.

## Projetos

### Meu Produto (2024-01 a atual)

- Papel: Founder
- Contexto (o que é, para quem): app de finanças para autônomos.
- O que fiz: desenhei e implementei tudo.
- Tecnologias: Next.js, Postgres
- Resultados:
  - 120 usuários na lista de espera [medido: planilha].
- Link: https://meuproduto.example.com
- O que NÃO fiz neste projeto (para não exagerar): não lancei ainda.

### Biblioteca aberta (2020-05 a 2021-02)

- Tecnologias: Python

## Formação
`;

  it("reads each project with its dates, link and what was not done", () => {
    const extract = extractProfile(parseBlocks(withProjects));
    expect(extract.projects).toEqual([
      {
        name: "Meu Produto",
        start: "2024-01",
        end: "present",
        role: "Founder",
        link: "https://meuproduto.example.com",
        notDone: ["não lancei ainda."],
      },
      {
        name: "Biblioteca aberta",
        start: "2020-05",
        end: "2021-02",
        role: null,
        link: null,
        notDone: [],
      },
    ]);
    // A project is never an experience.
    expect(extract.experiences.map((e) => e.company)).toEqual(["Beta"]);
    // Its figures are read, outside any experience.
    expect(extract.figures.map((f) => [f.mark, f.experience])).toEqual([
      ["noNumber", 0],
      ["measured", null],
    ]);
  });

  it("prefixes a project's passages with its title, its not-done as such", () => {
    const passages = profilePassages(parseBlocks(withProjects)).filter(
      (passage) => passage.section === "projects"
    );
    expect(passages.map((passage) => [passage.kind, passage.text])).toEqual([
      ["evidence", "Meu Produto (2024-01 a atual): Papel: Founder"],
      [
        "evidence",
        "Meu Produto (2024-01 a atual): Contexto (o que é, para quem): app de finanças para autônomos.",
      ],
      [
        "evidence",
        "Meu Produto (2024-01 a atual): O que fiz: desenhei e implementei tudo.",
      ],
      [
        "evidence",
        "Meu Produto (2024-01 a atual): Tecnologias: Next.js, Postgres",
      ],
      [
        "evidence",
        "Meu Produto (2024-01 a atual): Resultados:\n120 usuários na lista de espera [medido: planilha].",
      ],
      [
        "evidence",
        "Meu Produto (2024-01 a atual): Link: https://meuproduto.example.com",
      ],
      [
        "notDone",
        "Meu Produto (2024-01 a atual): O que NÃO fiz neste projeto (para não exagerar): não lancei ainda.",
      ],
      [
        "evidence",
        "Biblioteca aberta (2020-05 a 2021-02): Tecnologias: Python",
      ],
    ]);
    expect(passages.every((passage) => passage.experience === null)).toBe(true);
  });

  it("reviews each project as its own chunk", () => {
    expect(
      profileChunks(parseBlocks(withProjects)).map((chunk) => chunk.key)
    ).toEqual([
      "experience:beta — backend",
      "project:meu produto",
      "project:biblioteca aberta",
      "education",
    ]);
  });
});
