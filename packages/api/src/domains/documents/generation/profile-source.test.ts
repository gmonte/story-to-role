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
  it("keeps a measured figure, and takes the mark out", () => {
    expect(
      readFigures("Reduzi de 1,8 s para 0,6 s [medido: painel de APM].", true)
    ).toEqual({
      text: "Reduzi de 1,8 s para 0,6 s.",
      figures: "Reduzi de 1,8 s para 0,6 s",
    });
  });

  it("withholds an estimated or unconfirmed figure", () => {
    expect(readFigures("Cortei o custo em 30% [estimado].", true)).toEqual({
      text: "Cortei o custo em [figure withheld].",
      figures: "",
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
      figures: "Subi a conversão 12%",
    });
  });

  it("withholds a result's number nobody marked, but not a fact's", () => {
    expect(readFigures("Automatizei o deploy de 3 serviços.", true)).toEqual({
      text: "Automatizei o deploy de [figure withheld] serviços.",
      figures: "",
    });
    expect(readFigures("pagamentos B2B, time de 8.", false)).toEqual({
      text: "pagamentos B2B, time de 8.",
      figures: "pagamentos B2B, time de 8.",
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
      figures: "",
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
