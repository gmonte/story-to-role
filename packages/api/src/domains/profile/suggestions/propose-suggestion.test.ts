import { describe, expect, it } from "vitest";

import { sameAdditions } from "./propose-suggestion";

const experience = (detail: string) =>
  `### StoryToRole — Criador (2026-11 a atual)\n- Contexto: ${detail}`;

describe("sameAdditions", () => {
  it("supersedes a waiting addition of the same new experience", () => {
    const pending = [
      { id: "a", find: "", replace: experience("primeira versão") },
      { id: "b", find: "", replace: "### Outra — Dev (2020-01 a 2021-01)" },
    ];
    expect(
      sameAdditions(pending, { find: "", replace: experience("segunda") })
    ).toEqual(["a"]);
  });

  it("compares what an insertion after an anchor line adds", () => {
    const anchor = "- Resultados:";
    const pending = [
      { id: "a", find: anchor, replace: `${anchor}\n  - 80 PRs [medido]` },
    ];
    expect(
      sameAdditions(pending, {
        find: anchor,
        replace: `${anchor}\n  - 80 PRs [medido] em 5 dias`,
      })
    ).toEqual([]);
    expect(
      sameAdditions(pending, {
        find: anchor,
        replace: `${anchor}\n  - 80 PRs [medido]\n  - outro`,
      })
    ).toEqual(["a"]);
  });

  it("leaves rewrites to the overlap rule", () => {
    const pending = [{ id: "a", find: "", replace: experience("x") }];
    expect(
      sameAdditions(pending, { find: "linha velha", replace: experience("x") })
    ).toEqual([]);
  });
});
