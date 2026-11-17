import { describe, expect, it } from "vitest";

import type { PublishedProfile } from "@repo/api/domains/profile/load-published-profile";
import { parseBlocks } from "@repo/api/domains/profile/truth/blocks";
import {
  extractProfile,
  profilePassages,
} from "@repo/api/domains/profile/truth/extract";

import { readFigures, readProfileSource, stableId } from "./profile-source";

export const profileMarkdown = `# Perfil

## Identidade profissional

- Nome profissional: Ana Souza
- Senioridade e áreas: Desenvolvedora backend pleno, pagamentos.

## Contato (só o que pode aparecer no currículo)

- E-mail profissional: ana@exemplo.com
- Telefone: (31) 90000-0000
- Cidade e UF: Belo Horizonte, MG
- LinkedIn: linkedin.com/in/anasouza

## Experiência (da mais recente para a mais antiga)

### Empresa Beta — Desenvolvedora Backend (2022-03 a atual)

- Contexto (setor, tamanho do time, produto): pagamentos B2B, time de 8.
- Tecnologias: Python, FastAPI, PostgreSQL
- Resultados:
  - Reduzi o tempo de resposta de 1,8 s para 0,6 s [medido: painel de APM].
  - Cortei o custo de infraestrutura em 30% [estimado].
  - Melhoramos a performance do checkout [sem número].
  - Automatizei o deploy de 3 serviços.
- O que NÃO fiz neste cargo (para não exagerar): não administrei nuvem.

### Empresa Gama — Desenvolvedora Júnior (2019-02 a 2022-02)

- Tecnologias: Python, Django
- Resultados:
  - Reduzi em 40% o tempo do relatório mensal [a confirmar].

## Formação

- Sistemas de Informação — Universidade Exemplo — concluído

## Certificações

- Cloud Fundamentals — Fornecedor X — 2024-05 — expirada em 2026-05

## Competências

- Domino: Python, SQL
- Uso com frequência: FastAPI, Django
- Estudei, sem experiência profissional: Spark

## Idiomas

- Inglês — intermediário

## Lacunas conhecidas

- Nuvem em produção.

## Regras de comunicação

- Nunca incluir: Projeto Fênix
- Nunca afirmar: liderança de pessoas
`;

/** A published version as the loader returns it, with ids by ordinal. */
export function publishedOf(markdown: string): PublishedProfile {
  const blocks = parseBlocks(markdown);
  return {
    versionId: stableId("version"),
    number: 1,
    markdown,
    extract: extractProfile(blocks),
    passages: profilePassages(blocks).map((passage, ordinal) => ({
      id: stableId("passage", `${ordinal}`),
      kind: passage.kind,
      section: passage.section,
      experience: passage.experience,
      text: passage.text,
    })),
  };
}

describe("a profile line's figures", () => {
  // `figures` is the line a written figure is checked against: its words
  // stay (a name in it still backs a line), only withheld numbers go.
  it("keeps a measured figure, and takes the mark out", () => {
    expect(
      readFigures("Reduzi de 1,8 s para 0,6 s [medido: painel de APM].", true)
    ).toEqual({
      text: "Reduzi de 1,8 s para 0,6 s.",
      figures: "Reduzi de 1,8 s para 0,6 s.",
    });
  });

  it("withholds an estimated or unconfirmed figure", () => {
    expect(readFigures("Cortei o custo em 30% [estimado].", true)).toEqual({
      text: "Cortei o custo em [figure withheld].",
      figures: "Cortei o custo em.",
    });
    expect(readFigures("Reduzi em 40% o tempo [a confirmar]", true).text).toBe(
      "Reduzi em [figure withheld] o tempo"
    );
  });

  it("reads each figure by its own mark", () => {
    expect(
      readFigures(
        "Subi a conversão 12% [medido] e o NPS uns 20 pontos [estimado].",
        true
      )
    ).toEqual({
      text: "Subi a conversão 12% e o NPS uns [figure withheld] pontos.",
      figures: "Subi a conversão 12% e o NPS uns pontos.",
    });
  });

  it("withholds a result's number nobody marked, but not a fact's", () => {
    expect(readFigures("Automatizei o deploy de 3 serviços.", true)).toEqual({
      text: "Automatizei o deploy de [figure withheld] serviços.",
      figures: "Automatizei o deploy de serviços.",
    });
    expect(readFigures("pagamentos B2B, time de 8.", false)).toEqual({
      text: "pagamentos B2B, time de 8.",
      figures: "pagamentos B2B, time de 8.",
    });
  });

  it("withholds only a number standing on its own: not a name's digits nor a year", () => {
    expect(
      readFigures("Migrei 12 serviços B2B para EC2 e S3 em 2023 (AWS).", true)
    ).toEqual({
      text: "Migrei [figure withheld] serviços B2B para EC2 e S3 em 2023 (AWS).",
      figures: "Migrei serviços B2B para EC2 e S3 em 2023 (AWS).",
    });
    // A year with a unit or a decimal is a figure; a count of 1,900 to
    // 2,099 reads as a year, the price of dating a fact.
    expect(
      readFigures("Atendi 2023 lojas e cresci 1999% em 2020.5.", true).text
    ).toBe(
      "Atendi 2023 lojas e cresci [figure withheld] em [figure withheld]."
    );
  });

  // Product bug (profile-source.ts, `standaloneNumber`): the lookahead
  // `(?![\d.,%])` meant to keep "2020.5" a figure also sees the period that
  // ends a sentence, so a year closing a sentence is withheld. Enable once
  // the year test reads `(?![\d%]|[.,]\d)`.
  it("keeps a year that ends the sentence", () => {
    expect(readFigures("Migrei os serviços para EC2 em 2023.", true)).toEqual({
      text: "Migrei os serviços para EC2 em 2023.",
      figures: "Migrei os serviços para EC2 em 2023.",
    });
  });

  it("tells a line marked as having no number as written", () => {
    expect(
      readFigures("Melhoramos a performance do checkout [sem número].", true)
    ).toEqual({
      text: "Melhoramos a performance do checkout.",
      figures: "Melhoramos a performance do checkout.",
    });
    expect(
      readFigures("Atendi 3 regiões [no number] e 4 países [estimado].", true)
    ).toEqual({
      text: "Atendi 3 regiões e [figure withheld] países.",
      figures: "Atendi 3 regiões e países.",
    });
  });
});

describe("the profile as generation reads it", () => {
  const source = readProfileSource({
    careerProfileId: "career",
    profile: publishedOf(profileMarkdown),
  });

  it("takes the header from the identity and the contact", () => {
    expect(source.header).toEqual({
      name: "Ana Souza",
      email: "ana@exemplo.com",
      phone: "(31) 90000-0000",
      linkedin: "linkedin.com/in/anasouza",
      github: "",
      city: "Belo Horizonte, MG",
    });
    // Contact data is printed by code, never handed to a writer.
    expect(JSON.stringify(source.evidence)).not.toContain("ana@exemplo.com");
  });

  it("joins a website and a GitHub line in the header's last slot", () => {
    const withLinks = (lines: string) =>
      readProfileSource({
        careerProfileId: "career",
        profile: publishedOf(
          profileMarkdown.replace(
            "- LinkedIn: linkedin.com/in/anasouza\n",
            `- LinkedIn: linkedin.com/in/anasouza\n${lines}`
          )
        ),
      }).header;
    expect(
      withLinks("- GitHub: github.com/anasouza\n- Site ou portfólio: ana.dev\n")
    ).toMatchObject({
      linkedin: "linkedin.com/in/anasouza",
      github: "github.com/anasouza | ana.dev",
    });
    expect(withLinks("- Site ou portfólio: ana.dev\n").github).toBe("ana.dev");
    expect(withLinks("- GitHub: github.com/anasouza\n").github).toBe(
      "github.com/anasouza"
    );
  });

  it("reads the positions' locked facts, most recent first, with stable ids", () => {
    expect(source.positions).toMatchObject([
      {
        employer: "Empresa Beta",
        title: "Desenvolvedora Backend",
        startDate: "2022-03",
        endDate: null,
        notDone: ["não administrei nuvem."],
      },
      { employer: "Empresa Gama", startDate: "2019-02", endDate: "2022-02" },
    ]);
    const again = readProfileSource({
      careerProfileId: "career",
      profile: publishedOf(profileMarkdown.replace("time de 8", "time de 9")),
    });
    expect(again.positions.map((p) => p.id)).toEqual(
      source.positions.map((p) => p.id)
    );
  });

  it("gives each line as evidence of its position, figures by their marks", () => {
    const beta = source.positions[0].id;
    const of = (text: string) =>
      source.evidence.find((row) => row.text.includes(text))!;
    expect(of("Reduzi o tempo de resposta")).toMatchObject({
      positionId: beta,
      kind: "achievement",
      text: "Resultados: Reduzi o tempo de resposta de 1,8 s para 0,6 s.",
    });
    expect(of("Cortei o custo")).toMatchObject({
      text: "Resultados: Cortei o custo de infraestrutura em [figure withheld].",
      figures: "Cortei o custo de infraestrutura em.",
    });
    // Marked as having no number: told as written, the mark taken out.
    expect(of("Melhoramos a performance")).toMatchObject({
      text: "Resultados: Melhoramos a performance do checkout.",
    });
    expect(of("Tecnologias: Python, FastAPI")).toMatchObject({
      positionId: beta,
      kind: "tool",
    });
    // Each result is a line of its own, under the passage it belongs to.
    const results = [...source.evidenceOfPassage.values()].find(
      (ids) => ids.length === 4
    )!;
    expect(new Set(results).size).toBe(4);
  });

  it("never hands over what the profile says is lacking", () => {
    const text = JSON.stringify(source.evidence);
    expect(text).not.toContain("não administrei nuvem");
    expect(text).not.toContain("Spark");
    expect(text).not.toContain("Nuvem em produção");
    expect(text).not.toContain("Projeto Fênix");
    expect(source.skills.map((skill) => skill.name)).toEqual([
      "Python",
      "SQL",
      "FastAPI",
      "Django",
    ]);
    expect(source.rules).toEqual({
      neverInclude: ["Projeto Fênix"],
      neverClaim: ["liderança de pessoas"],
    });
    // What was only studied and the known gaps are named, so code can
    // refuse a line that claims them.
    expect(source.studied).toEqual(["Spark"]);
    expect(source.gaps).toEqual(["Nuvem em produção."]);
  });

  it("ties a competency to its passage by the whole word", () => {
    const { skills } = readProfileSource({
      careerProfileId: "career",
      profile: publishedOf(
        profileMarkdown.replace(
          "- Domino: Python, SQL\n- Uso com frequência: FastAPI, Django\n",
          "- Domino: MongoDB\n- Uso com frequência: Go\n"
        )
      ),
    });
    const passageOf = (name: string) =>
      skills.find((skill) => skill.name === name)!.evidenceIds;
    // "Go" is not the "Go" in "MongoDB": each names its own passage.
    expect(passageOf("Go")).toHaveLength(1);
    expect(passageOf("Go")).not.toEqual(passageOf("MongoDB"));
  });

  it("reads credentials with their real status", () => {
    expect(source.credentials).toMatchObject([
      {
        kind: "education",
        title: "Sistemas de Informação",
        institution: "Universidade Exemplo",
        inProgress: false,
      },
      {
        kind: "certification",
        title: "Cloud Fundamentals",
        institution: "Fornecedor X",
        level: "expirada em 2026-05",
        endDate: "2024-05",
      },
      { kind: "language", title: "Inglês", level: "intermediário" },
    ]);
  });
});
