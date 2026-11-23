import { describe, expect, it } from "vitest";

import { parseBlocks } from "@repo/api/domains/profile/truth/blocks";

import { competencyPosition } from "./competency-position";

const blocks = parseBlocks(`# Perfil

## Experiência (mais recente primeiro)

### Beta — Backend (2022-03 a atual)

- Tecnologias: React, TypeScript

## Competências

- Domino: TypeScript, React
- Uso com frequência: React Native
`);

describe("competencyPosition", () => {
  it("finds the competency's name on its line under Competencies", () => {
    const position = competencyPosition(blocks, "React");
    expect(position).not.toBeNull();
    const text = blocks[position!.line].text;
    expect(text).toBe("Domino: TypeScript, React");
    expect(text.slice(position!.from, position!.to)).toBe("React");
  });

  it("matches the whole name, ignoring case, never a longer one", () => {
    const position = competencyPosition(blocks, "react native");
    expect(blocks[position!.line].text).toBe(
      "Uso com frequência: React Native"
    );
  });

  it("is null for a competency the section doesn't list", () => {
    expect(competencyPosition(blocks, "Kotlin")).toBeNull();
  });
});
