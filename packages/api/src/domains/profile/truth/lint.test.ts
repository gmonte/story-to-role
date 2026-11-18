import { describe, expect, it } from "vitest";

import { parseBlocks, serializeBlocks } from "./blocks";
import { fixFormat, fixFinding } from "./fix";
import { lintProfile, type ProfileFinding } from "./lint";
import { profileTemplate } from "./template";

const valid = `# Perfil

## Identidade profissional

- Desenvolvedora backend pleno.

## Contato (só o que pode aparecer no currículo)

- E-mail profissional: ana@exemplo.com

## Experiência (mais recente primeiro)

### Empresa Beta — Desenvolvedora Backend (2022-03 a atual)

- Contexto: time de 8 pessoas.
- Tecnologias: Python, PostgreSQL
- Resultados:
  - Reduzi o tempo de resposta de 1,8 s para 0,6 s [medido: painel de APM].
- O que NÃO fiz: não administrei infraestrutura em nuvem.

### Empresa Gama — Desenvolvedora Júnior (2019-02 a 2022-02)

- Tecnologias: Python
- Resultados: relatórios usados diariamente [sem número].
- O que NÃO fiz: não liderei o time.

## Formação

- Sistemas de Informação — Universidade Exemplo — concluído
- Engenharia de Dados — Instituição Exemplo — em andamento até 2027-02

## Certificações

- Cloud Fundamentals — Fornecedor X — 2024-05 — válida
- Agile Basics — Fornecedor Y — 2020-01 — expirada em 2023-01

## Competências

- Domino: Python
- Uso com frequência: PostgreSQL
- Estudei, sem experiência profissional: Spark

## Idiomas

- Inglês — intermediário

## Lacunas conhecidas

- Spark em produção.

## Regras de comunicação

- Nunca incluir: Projeto Fênix
- Nunca afirmar: liderança de pessoas
`;

function codes(findings: ProfileFinding[]) {
  return findings.map((finding) => finding.code);
}

function lint(markdown: string) {
  return lintProfile(parseBlocks(markdown));
}

describe("the profile linter", () => {
  it("finds nothing in a profile that follows the method", () => {
    expect(lint(valid)).toEqual([]);
  });

  it("accepts a new profile from the template as well formed", () => {
    for (const language of ["pt-BR", "en-US"] as const) {
      const findings = lintProfile(profileTemplate(language));
      expect(findings.filter((f) => f.kind === "format")).toEqual([]);
    }
  });

  it("has no Addenda in a new profile, and flags an item under it", () => {
    for (const language of ["pt-BR", "en-US"] as const) {
      const markdown = serializeBlocks(profileTemplate(language));
      expect(markdown).not.toMatch(/adendos|addenda/i);
    }
    const findings = lint(
      `${valid}\n## Adendos (detalhes lembrados depois)\n\n- 2026-09-21: rotinas SQL agendadas [sem número].\n`
    );
    expect(codes(findings)).toEqual(["addendumToPlace"]);
    expect(findings[0].kind).toBe("content");
    expect(lint(`${valid}\n## Addenda (details remembered later)\n`)).toEqual(
      []
    );
  });

  it("marks a missing section and a section out of order", () => {
    const markdown = valid
      .replace("## Idiomas\n\n- Inglês — intermediário\n\n", "")
      .replace("## Formação", "## Formação_TMP")
      .replace(
        /## Formação_TMP\n\n([\s\S]*?)## Certificações\n\n([\s\S]*?)## Competências/,
        "## Certificações\n\n$2## Formação\n\n$1## Competências"
      );
    expect(codes(lint(markdown))).toEqual(
      expect.arrayContaining(["missingSection", "sectionOrder"])
    );
  });

  it("marks an experience title out of format, and Fix format rewrites it", () => {
    const markdown = valid.replace(
      "### Empresa Gama — Desenvolvedora Júnior (2019-02 a 2022-02)",
      "### Empresa Gama: Desenvolvedora Júnior (Fev/2019 - 02/2022)"
    );
    const findings = lint(markdown);
    expect(codes(findings)).toEqual(["experienceTitle"]);
    expect(findings[0].fixable).toBe(true);

    const fixed = fixFinding(parseBlocks(markdown), findings[0]);
    expect(serializeBlocks(fixed)).toBe(valid);
  });

  it("leaves a title it can't read marked", () => {
    const markdown = valid.replace(
      "### Empresa Gama — Desenvolvedora Júnior (2019-02 a 2022-02)",
      "### Empresa Gama, uns anos aí"
    );
    const findings = lint(markdown);
    expect(codes(findings)).toContain("experienceTitle");
    expect(findings.find((f) => f.code === "experienceTitle")?.fixable).toBe(
      false
    );
    expect(
      lintProfile(fixFormat(parseBlocks(markdown))).map((f) => f.code)
    ).toContain("experienceTitle");
  });

  it("marks a figure without a mark, on the figure's line", () => {
    const markdown = valid.replace(" [medido: painel de APM].", ".");
    const findings = lint(markdown);
    expect(codes(findings)).toEqual(["unmarkedFigure"]);
    expect(findings[0].kind).toBe("content");
  });

  it("reads a label written twice in an experience as one field", () => {
    const markdown = valid.replace(
      "- O que NÃO fiz: não liderei o time.\n",
      "- O que NÃO fiz: não liderei o time.\n- Resultados: cortei 30% do custo\n"
    );
    expect(codes(lint(markdown))).toEqual(["unmarkedFigure"]);
  });

  it("rewrites marks written another way into the canonical one", () => {
    const markdown = valid.replace(
      "[sem número].\n- O que",
      "(Sem Numero).\n- O que"
    );
    const findings = lint(markdown);
    expect(codes(findings)).toEqual(["markFormat"]);
    expect(serializeBlocks(fixFormat(parseBlocks(markdown)))).toBe(valid);
  });

  it("marks an experience without what the user did not do", () => {
    const markdown = valid.replace(
      "- O que NÃO fiz: não liderei o time.\n",
      ""
    );
    expect(codes(lint(markdown))).toEqual(["missingNotDone"]);
  });

  it("marks experiences out of order", () => {
    const markdown = valid.replace("2022-03 a atual", "2018-03 a 2018-12");
    expect(codes(lint(markdown))).toContain("experienceOrder");
  });

  it("marks education and certification lines out of format", () => {
    const markdown = valid
      .replace("em andamento até 2027-02", "em andamento até 02/2027")
      .replace(" — 2024-05 — válida", " — 2024-05");
    const findings = lint(markdown);
    expect(codes(findings)).toEqual(["dateFormat", "certificationStatus"]);
    const fixed = lintProfile(fixFormat(parseBlocks(markdown)));
    expect(codes(fixed)).toEqual(["certificationStatus"]);
  });

  it("marks an expired certification without its date", () => {
    const markdown = valid.replace("expirada em 2023-01", "expirada");
    expect(codes(lint(markdown))).toEqual(["expiredWithoutDate"]);
  });

  it("marks a competency line without a level", () => {
    const markdown = valid.replace("- Domino: Python", "- Python, SQL");
    expect(codes(lint(markdown))).toContain("competencyLevel");
  });

  it("marks a tool missing from Competencies and a competency with no experience", () => {
    const markdown = valid
      .replace(
        "- Tecnologias: Python, PostgreSQL",
        "- Tecnologias: Python, PostgreSQL, Docker"
      )
      .replace("- Domino: Python", "- Domino: Python, Kotlin");
    const findings = lint(markdown);
    expect(codes(findings)).toEqual(
      expect.arrayContaining(["competencyMissing", "competencyUnbacked"])
    );
    const missing = findings.find((f) => f.code === "competencyMissing");
    expect(missing?.params).toEqual({ name: "Docker" });
  });

  it("accepts an occasional competency an experience uses", () => {
    const markdown = valid
      .replace(
        "- Uso com frequência: PostgreSQL\n",
        "- Uso com frequência: PostgreSQL\n- Experiência pontual: Redis\n"
      )
      .replace(
        "- Tecnologias: Python, PostgreSQL\n",
        "- Tecnologias: Python, PostgreSQL, Redis\n"
      );
    expect(codes(lint(markdown))).toEqual(codes(lint(valid)));
  });

  it("marks a studied competency used in an experience", () => {
    const markdown = valid.replace(
      "- Tecnologias: Python\n",
      "- Tecnologias: Python, Spark\n"
    );
    expect(codes(lint(markdown))).toContain("studiedUsed");
  });

  it("never flags a “never include” term in the profile itself", () => {
    const markdown = valid.replace(
      "- Contexto: time de 8 pessoas.",
      "- Contexto: time de 8 pessoas no Projeto Fênix."
    );
    expect(codes(lint(markdown))).toEqual([]);
  });

  it("marks a half-written public names entry, as a content finding", () => {
    const markdown = valid.replace(
      "- Nunca incluir: Projeto Fênix",
      "- Nunca incluir: Projeto Fênix\n- Nomes públicos: Banco X →; Projeto Fênix → plataforma de pagamentos"
    );
    const findings = lint(markdown);
    expect(codes(findings)).toEqual(["publicNameFormat"]);
    expect(findings[0].kind).toBe("content");
    expect(findings[0].params).toEqual({ entry: "Banco X →" });
  });

  it("never blocks publishing over a mark written another way", () => {
    const markdown = valid.replace(
      "[sem número].\n- O que",
      "[Sem número].\n- O que"
    );
    expect(lint(markdown).map((f) => f.kind)).toEqual(["content"]);
  });

  it("inserts missing sections and reorders them with Fix format", () => {
    const markdown = valid
      .replace("## Idiomas\n\n- Inglês — intermediário\n\n", "")
      .replace("## Lacunas conhecidas\n\n- Spark em produção.\n\n", "");
    const fixed = fixFormat(parseBlocks(markdown));
    expect(
      codes(lintProfile(fixed)).filter((c) => c.includes("Section"))
    ).toEqual([]);
  });
});

describe("projects in the linter", () => {
  const withProject = (heading: string, results = "") =>
    valid.replace(
      "## Formação",
      `## Projetos\n\n### ${heading}\n\n- Tecnologias: Python\n- Resultados: ${results}\n\n## Formação`
    );

  it("never demands the section, and accepts a project after the experiences", () => {
    expect(
      lintProfile(parseBlocks(valid)).filter((f) => f.code === "missingSection")
    ).toEqual([]);
    const findings = lintProfile(
      parseBlocks(withProject("App (2024-01 a atual)", "lançado [sem número]."))
    );
    expect(findings.filter((f) => f.kind === "format")).toEqual([]);
    // No "what I did not do" is asked of a project.
    expect(findings.filter((f) => f.code === "missingNotDone")).toEqual([]);
  });

  it("flags a project title out of format, and Fix format rewrites a recognizable one", () => {
    const blocks = parseBlocks(withProject("App (Jan/2024 - atual)"));
    const [finding] = lintProfile(blocks).filter(
      (f) => f.code === "projectTitle"
    );
    expect(finding).toMatchObject({ kind: "format", fixable: true });
    expect(serializeBlocks(fixFinding(blocks, finding))).toContain(
      "### App (2024-01 a atual)"
    );
    expect(
      lintProfile(parseBlocks(withProject("App sem data"))).filter(
        (f) => f.code === "projectTitle"
      )
    ).toMatchObject([{ fixable: false }]);
  });

  it("asks for a mark on a project result's figure", () => {
    const findings = lintProfile(
      parseBlocks(withProject("App (2024-01 a atual)", "120 usuários."))
    );
    expect(findings.filter((f) => f.code === "unmarkedFigure")).toHaveLength(1);
  });

  it("puts Projects out of order anywhere but after Experience", () => {
    const before = valid.replace(
      "## Experiência (mais recente primeiro)",
      "## Projetos\n\n## Experiência (mais recente primeiro)"
    );
    expect(
      lintProfile(parseBlocks(before)).filter((f) => f.code === "sectionOrder")
    ).toHaveLength(1);
  });
});
