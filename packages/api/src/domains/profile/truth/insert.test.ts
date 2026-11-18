import { describe, expect, it } from "vitest";

import { parseBlocks, serializeBlocks } from "./blocks";
import { insertEntry, setCompetencyLevel } from "./insert";
import { lintProfile } from "./lint";
import { profileTemplate } from "./template";

function insert(markdown: string, entry: Parameters<typeof insertEntry>[1]) {
  return serializeBlocks(insertEntry(parseBlocks(markdown), entry).blocks);
}

describe("the insert menu", () => {
  it("adds an experience in its section, in format, by date", () => {
    let blocks = profileTemplate("pt-BR");
    blocks = insertEntry(blocks, {
      kind: "experience",
      company: "Gama",
      title: "Dev",
      range: { start: "2019-02", end: "2022-02" },
    }).blocks;
    const { blocks: next, line } = insertEntry(blocks, {
      kind: "experience",
      company: "Beta",
      title: "Dev Sênior",
      range: { start: "2022-03", end: "present" },
    });
    const markdown = serializeBlocks(next);
    expect(
      markdown.indexOf("### Beta — Dev Sênior (2022-03 a atual)")
    ).toBeLessThan(markdown.indexOf("### Gama — Dev (2019-02 a 2022-02)"));
    expect(next[line]).toEqual({
      type: "heading",
      level: 3,
      text: "Beta — Dev Sênior (2022-03 a atual)",
    });
    expect(markdown).toContain(
      "- O que NÃO fiz neste cargo (para não exagerar):"
    );
    // The new experiences break no format rule.
    expect(lintProfile(next).filter((f) => f.kind === "format")).toEqual([]);
  });

  it("adds a project in its own section, right after Experience, by date", () => {
    // An older profile without the section: the Add menu creates it.
    const markdown = serializeBlocks(profileTemplate("pt-BR")).replace(
      "## Projetos\n\n",
      ""
    );
    let blocks = parseBlocks(markdown);
    blocks = insertEntry(blocks, {
      kind: "project",
      name: "Biblioteca",
      range: { start: "2020-05", end: "2021-02" },
    }).blocks;
    const { blocks: next, line } = insertEntry(blocks, {
      kind: "project",
      name: "Meu Produto",
      role: "Founder",
      range: { start: "2024-01", end: "present" },
    });
    const text = serializeBlocks(next);
    expect(next[line]).toEqual({
      type: "heading",
      level: 3,
      text: "Meu Produto (2024-01 a atual)",
    });
    expect(text.indexOf("## Experiência")).toBeLessThan(
      text.indexOf("## Projetos")
    );
    expect(text.indexOf("## Projetos")).toBeLessThan(
      text.indexOf("## Formação")
    );
    expect(text.indexOf("### Meu Produto")).toBeLessThan(
      text.indexOf("### Biblioteca (2020-05 a 2021-02)")
    );
    expect(text).toContain(
      "### Meu Produto (2024-01 a atual)\n\n- Papel: Founder\n"
    );
    expect(text).toContain("### Biblioteca (2020-05 a 2021-02)\n\n- Papel:\n");
    expect(text).toContain("- O que fiz:");
    expect(text).toContain("- Link:");
    expect(text).toContain(
      "- O que NÃO fiz neste projeto (para não exagerar):"
    );
    expect(lintProfile(next).filter((f) => f.kind === "format")).toEqual([]);
  });

  it("writes education, certifications, and languages in format", () => {
    let blocks = profileTemplate("en-US");
    for (const entry of [
      {
        kind: "education",
        course: "CS",
        institution: "MIT",
        inProgressUntil: "2027-02",
      },
      {
        kind: "certification",
        name: "AWS",
        issuer: "Amazon",
        date: "2023-01",
        status: "expired",
        expiredOn: "2026-01",
      },
      { kind: "language", language: "Portuguese", level: "native" },
    ] as const) {
      blocks = insertEntry(blocks, entry).blocks;
    }
    const markdown = serializeBlocks(blocks);
    expect(markdown).toContain(
      "## Education\n\n- CS — MIT — in progress until 2027-02"
    );
    expect(markdown).toContain("- AWS — Amazon — 2023-01 — expired in 2026-01");
    expect(markdown).toContain("## Languages\n\n- Portuguese — native");
    expect(lintProfile(blocks).filter((f) => f.kind === "format")).toEqual([]);
  });

  it("adds a competency to its level's line and a rule to its label", () => {
    const markdown = insert(
      insert(serializeBlocks(profileTemplate("pt-BR")), {
        kind: "competency",
        name: "Python",
        level: "master",
      }),
      { kind: "competency", name: "SQL", level: "master" }
    );
    expect(markdown).toContain("- Domino: Python, SQL\n");
    expect(
      insert(markdown, { kind: "rule", rule: "neverClaim", text: "liderança" })
    ).toContain(
      "- Nunca afirmar: números que não estejam marcados como [medido] ou [estimado], liderança\n"
    );
  });

  it("creates a missing section where it belongs", () => {
    const markdown = insert("## Identidade profissional\n\n## Competências\n", {
      kind: "experience",
      company: "Beta",
      title: "Dev",
      range: { start: "2022-03", end: "present" },
    });
    expect(markdown).toBe(
      "## Identidade profissional\n\n## Experiência (mais recente primeiro)\n\n### Beta — Dev (2022-03 a atual)\n\n- Contexto (setor, tamanho do time, produto):\n- Responsabilidades:\n- Tecnologias:\n- Resultados:\n- O que NÃO fiz neste cargo (para não exagerar):\n\n## Competências\n"
    );
  });

  it("moves a competency to the level a validation proposed", () => {
    const markdown =
      "## Competências\n\n- Domino: Python\n- Uso com frequência: SQL, Docker\n";
    expect(
      serializeBlocks(
        setCompetencyLevel(parseBlocks(markdown), "SQL", "master")
      )
    ).toBe(
      "## Competências\n\n- Domino: Python, SQL\n- Uso com frequência: Docker\n"
    );
  });

  it("moves a competency to occasional experience", () => {
    const markdown =
      "## Competências\n\n- Domino: Python\n- Uso com frequência: SQL, Docker\n";
    const out = serializeBlocks(
      setCompetencyLevel(parseBlocks(markdown), "Docker", "occasional")
    );
    expect(out).toContain("- Uso com frequência: SQL\n");
    expect(out).toContain("- Experiência pontual: Docker");
  });
  it("adds a public name to the dictionary, inline or as a sub-item", () => {
    const base = `# Perfil\n\n## Regras de comunicação\n\n- Nunca afirmar: liderança`;
    const created = insert(base, {
      kind: "rule",
      rule: "publicName",
      original: "Instabov",
      public: "plataforma de gado",
    });
    expect(created).toContain(
      "- Nomes públicos:\n  - Instabov → plataforma de gado"
    );
    const listed = insert(created, {
      kind: "rule",
      rule: "publicName",
      original: "Chief",
      public: "chat de IA",
    });
    expect(listed).toContain(
      "  - Instabov → plataforma de gado\n  - Chief → chat de IA"
    );
    const inline = insert(`${base}\n- Nomes públicos: Banco X → banco`, {
      kind: "rule",
      rule: "publicName",
      original: "Chief",
      public: "chat de IA",
    });
    expect(inline).toContain(
      "- Nomes públicos: Banco X → banco; Chief → chat de IA"
    );
  });
});
