import { describe, expect, it } from "vitest";

import { parseBlocks, serializeBlocks } from "./blocks";
import { lintProfile } from "./lint";
import { quickActionsFor } from "./quick-fix";

const profile = `# Ana

## Competências

- Domino: Python, Go
- Uso com frequência:
- Experiência pontual:
- Estudei, sem experiência profissional:

## Experiência

### Acme — Dev (2020-01 a atual)

- Tecnologias: Python, Rust

### Beta — Dev (2018-01 a 2019-12)

- Tecnologias: Python
- O que NÃO fiz neste cargo (para não exagerar):

## Certificações

- AWS — Amazon — 2023-01
- GCP — Google — 2023-01 — ?
`;

function run(code: string, nth = 0) {
  const blocks = parseBlocks(profile);
  const found = lintProfile(blocks).filter((f) => f.code === code)[nth];
  expect(found).toBeDefined();
  return { blocks, found, actions: quickActionsFor(found, blocks, "pt-BR") };
}

describe("quick actions", () => {
  it("adds a missing competency at any of the four levels", () => {
    const { actions } = run("competencyMissing");
    expect(actions.map((a) => a.level)).toEqual([
      "master",
      "often",
      "occasional",
      "studied",
    ]);
    expect(serializeBlocks(actions[1].blocks)).toContain(
      "- Uso com frequência: Rust"
    );
  });

  it("moves an unbacked competency to Studied", () => {
    const blocks = parseBlocks(profile);
    const found = lintProfile(blocks).find(
      (f) => f.code === "competencyUnbacked"
    );
    expect(found?.params?.name).toBe("Go");
    if (!found) return;
    const [action] = quickActionsFor(found, blocks, "pt-BR");
    expect(serializeBlocks(action.blocks)).toContain(
      `Estudei, sem experiência profissional: ${found.params?.name}`
    );
  });

  it("sets a certification status, with or without a blank", () => {
    const first = run("certificationStatus", 0);
    expect(serializeBlocks(first.actions[0].blocks)).toContain(
      "- AWS — Amazon — 2023-01 — válida"
    );
    const second = run("certificationStatus", 1);
    expect(serializeBlocks(second.actions[1].blocks)).toContain(
      "- GCP — Google — 2023-01 — em renovação"
    );
  });

  it("adds the not-done line at the end of its experience", () => {
    const { blocks, actions } = run("missingNotDone");
    const [action] = actions;
    expect(action.blocks[action.line].text).toBe(
      "O que NÃO fiz neste cargo (para não exagerar):"
    );
    expect(action.blocks.length).toBe(blocks.length + 1);
    // The other experience's empty line is only reached.
    const empty = lintProfile(blocks).filter(
      (f) => f.code === "missingNotDone"
    );
    const reach = quickActionsFor(empty[1], blocks, "pt-BR")[0];
    expect(reach.blocks).toBe(blocks);
  });
});
