import { describe, expect, it } from "vitest";

import { parseBlocks } from "./blocks";
import { markImportedFigures } from "./imported-figures";

const draft = parseBlocks(`## Experiência (mais recente primeiro)

### Beta — Backend (2022-03 a atual)

- Contexto: time de 8 pessoas.
- Resultados:
  - Melhorei a performance [sem número].
- O que NÃO fiz:
`);

const resume = "Reduced response time by 60%. Team of 8. Cut costs by 30%.";

describe("figures from an uploaded file", () => {
  it("arrive as “a confirmar” under an experience's results", () => {
    const change = markImportedFigures(
      draft,
      {
        part: "experience:beta — backend",
        find: "  - Melhorei a performance [sem número].",
        replace:
          "  - Melhorei a performance [sem número].\n  - Reduzi o tempo de resposta em 60%.",
      },
      resume,
      "pt-BR"
    );
    expect(change.replace).toBe(
      "  - Melhorei a performance [sem número].\n  - Reduzi o tempo de resposta em 60% [a confirmar]."
    );
  });

  it("turns a mark the file doesn't carry into the open one", () => {
    const change = markImportedFigures(
      draft,
      {
        part: "experience",
        find: "",
        replace:
          "### Gama — Dev (2019-02 a 2022-02)\n- Contexto: time de 8 pessoas.\n- Resultados:\n  - Reduzi custos em 30% [medido].\n  - Organizei o time [sem número].\n- O que NÃO fiz:",
      },
      resume,
      "pt-BR"
    );
    expect(change.replace).toContain("- Reduzi custos em 30% [a confirmar].");
    // Figures outside results, and qualitative results, are left alone.
    expect(change.replace).toContain("- Contexto: time de 8 pessoas.");
    expect(change.replace).toContain("- Organizei o time [sem número].");
    expect(change.replace).toContain("### Gama — Dev (2019-02 a 2022-02)");
  });

  it("never touches the marks of lines the profile already has", () => {
    const measured = parseBlocks(`## Experiência (mais recente primeiro)

### Beta — Backend (2022-03 a atual)

- Resultados:
  - Reduzi o tempo de 1,8 s para 0,6 s [medido: painel de APM].
- O que NÃO fiz:
`);
    const change = markImportedFigures(
      measured,
      {
        part: "experience:beta — backend",
        find: "  - Reduzi o tempo de 1,8 s para 0,6 s [medido: painel de APM].",
        replace:
          "  - Reduzi o tempo de 1,8 s para 0,6 s [medido: painel de APM].\n  - Automatizei o deploy de 3 serviços.\n  - [sem número]",
      },
      "Automated the deployment of 3 services.",
      "pt-BR"
    );
    expect(change.replace).toBe(
      "  - Reduzi o tempo de 1,8 s para 0,6 s [medido: painel de APM].\n  - Automatizei o deploy de 3 serviços [a confirmar]."
    );
  });

  it("keeps the marks a truth file gives its own figures", () => {
    const change = markImportedFigures(
      draft,
      {
        part: "experience:beta — backend",
        find: "- Resultados:",
        replace: "- Resultados: reduzi 60% [medido: painel de APM].",
      },
      "Reduzi 60% [medido: painel de APM].",
      "pt-BR"
    );
    expect(change.replace).toBe(
      "- Resultados: reduzi 60% [medido: painel de APM]."
    );
  });
});
