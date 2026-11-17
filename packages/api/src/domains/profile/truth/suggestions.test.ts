import { describe, expect, it } from "vitest";

import { parseBlocks, serializeBlocks } from "./blocks";
import {
  applyChange,
  listParts,
  locateChange,
  normalizeChange,
  partText,
  ungivenFigures,
} from "./suggestions";

const profile = `# Perfil

## Identidade profissional

- Dev backend.

## Experiência (mais recente primeiro)

### Beta — Backend (2022-03 a atual)

- Tecnologias: Python
- Resultados:
  - Reduzi a latência [sem número].
- O que NÃO fiz:

### Gama — Júnior (2019-02 a 2022-02)

- Tecnologias: Python
- Resultados: relatórios diários [sem número].

## Lacunas conhecidas

- Nuvem em produção.
`;

const blocks = () => parseBlocks(profile);
// As a suggestion travels: normalized when proposed, applied when accepted.
const apply = (change: Parameters<typeof applyChange>[1]) => {
  const normalized = normalizeChange(blocks(), change);
  const next = normalized && applyChange(blocks(), normalized);
  return next && serializeBlocks(next);
};

describe("the parts of the profile", () => {
  it("lists sections and each experience, with stable keys", () => {
    expect(listParts(blocks()).map((part) => part.key)).toEqual([
      "identity",
      "experience",
      "experience:beta — backend",
      "experience:gama — júnior",
      "gaps",
    ]);
  });

  it("reads one experience, and Experience as its list of positions", () => {
    expect(partText(blocks(), "experience:gama — júnior")).toBe(
      "### Gama — Júnior (2019-02 a 2022-02)\n- Tecnologias: Python\n- Resultados: relatórios diários [sem número]."
    );
    expect(partText(blocks(), "experience")).toContain(
      "experience:beta — backend"
    );
    expect(partText(blocks(), "experience")).not.toContain("latência");
    expect(partText(blocks(), "nope")).toBeNull();
  });
});

describe("a suggested change", () => {
  it("replaces the lines it quotes, inside its part", () => {
    // The same line exists in both experiences: the part decides.
    expect(
      apply({
        part: "experience:gama — júnior",
        find: "- Tecnologias: Python",
        replace: "- Tecnologias: Python, Django",
      })
    ).toContain(
      "### Gama — Júnior (2019-02 a 2022-02)\n\n- Tecnologias: Python, Django\n"
    );
    expect(
      apply({
        part: "experience:gama — júnior",
        find: "- Tecnologias: Python",
        replace: "- Tecnologias: Python, Django",
      })
    ).toContain("(2022-03 a atual)\n\n- Tecnologias: Python\n");
  });

  it("keeps the list shape when the model drops the markers", () => {
    expect(
      apply({
        part: "experience:beta — backend",
        find: "Reduzi a latência [sem número].",
        replace:
          "Reduzi a latência do checkout [sem número].\nAutomatizei o deploy [sem número].",
      })
    ).toContain(
      "- Resultados:\n  - Reduzi a latência do checkout [sem número].\n  - Automatizei o deploy [sem número].\n- O que NÃO fiz:"
    );
  });

  it("writes the change the way the document does, once", () => {
    const normalized = normalizeChange(blocks(), {
      part: "experience:beta — backend",
      find: "Reduzi a latência [sem número].",
      replace: "- Reduzi a latência do checkout [sem número].",
    });
    expect(normalized).toEqual({
      part: "experience:beta — backend",
      find: "  - Reduzi a latência [sem número].",
      replace: "  - Reduzi a latência do checkout [sem número].",
    });
    expect(normalizeChange(blocks(), normalized!)).toEqual(normalized);
  });

  it("removes lines and adds at the end of a part", () => {
    expect(
      apply({ part: "gaps", find: "- Nuvem em produção.", replace: "" })
    ).toMatch(/## Lacunas conhecidas\n$/);
    expect(
      apply({ part: "gaps", find: "", replace: "Kafka em produção." })
    ).toMatch(/- Nuvem em produção\.\n- Kafka em produção\.\n$/);
    expect(
      apply({
        part: "experience:beta — backend",
        find: "",
        replace: "- Contexto: time de oito pessoas.",
      })
    ).toContain(
      "- O que NÃO fiz:\n- Contexto: time de oito pessoas.\n\n### Gama"
    );
  });

  it("places a new experience by its dates", () => {
    const next = apply({
      part: "experience",
      find: "",
      replace: "### Delta — Pleno (2021-01 a 2022-02)\n- Tecnologias: Go",
    });
    expect(next!.indexOf("### Delta")).toBeGreaterThan(
      next!.indexOf("### Beta")
    );
    expect(next!.indexOf("### Delta")).toBeLessThan(next!.indexOf("### Gama"));
  });

  it("follows its lines when the part's title changed", () => {
    const renamed = parseBlocks(
      profile.replace("Gama — Júnior", "Gama — Pleno")
    );
    expect(
      locateChange(renamed, {
        part: "experience:gama — júnior",
        find: "- Resultados: relatórios diários [sem número].",
        replace: "x",
      })
    ).toEqual({ start: 11, end: 12 });
  });

  it("is stale when its lines are gone or ambiguous", () => {
    expect(
      locateChange(blocks(), {
        part: "experience:beta — backend",
        find: "- Tecnologias: Java",
        replace: "x",
      })
    ).toBeNull();
    // The part is gone and the line exists twice: nowhere certain to apply.
    expect(
      locateChange(blocks(), {
        part: "experience:outra",
        find: "- Tecnologias: Python",
        replace: "x",
      })
    ).toBeNull();
  });
});

describe("figures the user never gave", () => {
  it("names the numbers found in no source", () => {
    expect(
      ungivenFigures("Reduzi de 1,8 s para 0,6 s e economizei 40%", [
        "o tempo foi de 1.8 s para 0,6 s",
      ])
    ).toEqual(["40"]);
  });

  it("lets months of a date through when the year was given", () => {
    expect(
      ungivenFigures("### Beta — Dev (2021-03 a 2022-11)", [
        "entrei em março de 2021 e saí em novembro de 2022",
      ])
    ).toEqual([]);
    expect(
      ungivenFigures("### Beta — Dev (2020-03 a atual)", ["entrei em março"])
    ).toEqual(["2020"]);
  });
});
