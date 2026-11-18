import { describe, expect, it } from "vitest";

import { parseBlocks } from "./blocks";
import { profileChunks, profileIndex } from "./chunks";
import { extractProfile } from "./extract";

const markdown = `# Perfil

## Identidade profissional

- Dev backend.

## Projetos

> Projetos pessoais.

- Resultados:

## Lacunas conhecidas

- Nuvem em produção.
`;

describe("an empty section", () => {
  const blocks = parseBlocks(markdown);

  it("is never reviewed or indexed, and yields no projects", () => {
    const keys = profileChunks(blocks).map((chunk) => chunk.key);
    expect(keys).not.toContain("projects");
    expect(keys).toContain("gaps");
    expect(profileIndex(blocks)).not.toMatch(/Projetos/);
    expect(extractProfile(blocks).projects).toEqual([]);
  });

  it("is used again once it has content", () => {
    const filled = parseBlocks(
      markdown.replace(
        "- Resultados:",
        "### App (2024-01 a atual)\n\n- Resultados: lançado [sem número]."
      )
    );
    expect(profileChunks(filled).map((chunk) => chunk.key)).toContain(
      "project:app"
    );
    expect(profileIndex(filled)).toMatch(/Projetos/);
  });
});
