import { describe, expect, it } from "vitest";

import { parseBlocks, serializeBlocks } from "./blocks";
import {
  applyChange,
  listParts,
  locateChange,
  normalizeChange,
  partText,
  rewriteFragment,
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

  it("lists each project as a part of its own", () => {
    const withProjects = parseBlocks(
      profile.replace(
        "## Lacunas conhecidas",
        "## Projetos\n\n### App (2024-01 a atual)\n\n- Tecnologias: Go\n\n## Lacunas conhecidas"
      )
    );
    expect(
      listParts(withProjects).map((part) => [part.key, part.kind])
    ).toContainEqual(["project:app", "project"]);
    expect(partText(withProjects, "project:app")).toBe(
      "### App (2024-01 a atual)\n- Tecnologias: Go"
    );
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

  it("adds nothing that is already there", () => {
    expect(
      locateChange(blocks(), {
        part: "gaps",
        find: "",
        replace: "- Nuvem em produção.",
      })
    ).toBeNull();
  });

  it("is stale when its lines appear twice in its part", () => {
    const twice = parseBlocks(
      profile.replace(
        "- O que NÃO fiz:\n",
        "- Tecnologias: Python\n- O que NÃO fiz:\n"
      )
    );
    expect(
      locateChange(twice, {
        part: "experience:beta — backend",
        find: "- Tecnologias: Python",
        replace: "x",
      })
    ).toBeNull();
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

describe("a change inside a waiting suggestion", () => {
  const waiting =
    "### Gama — Júnior (2019-02 a 2022-02)\n- Tecnologias: Python\n- Resultados:\n  - Relatórios diários [sem número].";

  it("rewrites its lines or adds at its end", () => {
    expect(
      rewriteFragment(
        waiting,
        "Tecnologias: Python",
        "Tecnologias: Python, SQL"
      )
    ).toContain("- Tecnologias: Python, SQL\n- Resultados:");
    expect(
      rewriteFragment(
        waiting,
        "  - Relatórios diários [sem número].",
        "- Relatórios diários [sem número].\n- Cortei 40% do tempo [a confirmar]."
      )
    ).toMatch(
      /- Resultados:\n {2}- Relatórios diários \[sem número\]\.\n {2}- Cortei 40% do tempo \[a confirmar\]\.$/
    );
    expect(rewriteFragment(waiting, "", "- O que NÃO fiz:")).toMatch(
      /\n- O que NÃO fiz:$/
    );
  });

  it("is nothing when its lines aren't there, or nothing changes", () => {
    expect(rewriteFragment(waiting, "- Tecnologias: Java", "x")).toBeNull();
    expect(
      rewriteFragment(waiting, "- Tecnologias: Python", "- Tecnologias: Python")
    ).toBeNull();
    expect(rewriteFragment(waiting, "", "- Tecnologias: Python")).toBeNull();
  });
});

describe("figures the user never gave", () => {
  it("names the numbers found in no source", () => {
    expect(
      ungivenFigures("Reduzi de 1,8 s para 0,6 s e economizei 40%", [
        "o tempo foi de 1.8 s para 0,6 s",
      ])
    ).toEqual(["40%"]);
  });

  it("takes a percentage only when it was given as one", () => {
    expect(ungivenFigures("Reduzi 40%", ["um time de 40 pessoas"])).toEqual([
      "40%",
    ]);
    expect(ungivenFigures("Reduzi 40%", ["uns 40 por cento"])).toEqual([]);
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

describe("an addition never makes a second heading of a section", () => {
  const move = {
    part: "projects",
    find: "",
    replace: "## Projetos\n\n### StoryToRole (2024-01 a atual)\n\n- Lançado.",
  };
  const withProjects = profile.replace(
    "## Lacunas conhecidas",
    "## Projetos\n\n### App (2023-01 a 2023-06)\n\n- Feito.\n\n## Lacunas conhecidas"
  );
  const headings = (markdown: string) =>
    markdown.match(/^## Projetos$/gm)?.length ?? 0;

  it("creates the section once when it is missing", () => {
    const next = apply(move)!;
    expect(headings(next)).toBe(1);
    expect(next).toContain("### StoryToRole");
  });

  it("goes into the section when it exists", () => {
    const existing = parseBlocks(withProjects);
    const normalized = normalizeChange(existing, move)!;
    const next = serializeBlocks(applyChange(existing, normalized)!);
    expect(headings(next)).toBe(1);
    expect(next).toContain("### StoryToRole");
  });

  it("two waiting additions create it once between them", () => {
    const other = {
      ...move,
      replace: "### Outro (2022-01 a 2022-12)\n\n- Ok.",
    };
    let next = blocks();
    for (const change of [move, other]) {
      const normalized = normalizeChange(next, change)!;
      next = applyChange(next, normalized)!;
    }
    expect(headings(serializeBlocks(next))).toBe(1);
  });
});
