import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseBlocks, serializeBlocks } from "./blocks";
import { profileTemplate } from "./template";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("the profile's Markdown round trip", () => {
  it.each(["method-template.md", "method-example.md"])(
    "keeps every line of %s",
    (name) => {
      const blocks = parseBlocks(fixture(name));
      const markdown = serializeBlocks(blocks);
      expect(parseBlocks(markdown)).toEqual(blocks);
      // Only blank lines may differ from the method's file.
      const lines = (text: string) =>
        text
          .split("\n")
          .filter((line) => line.trim())
          .map((l) => l.trimEnd());
      expect(lines(markdown)).toEqual(lines(fixture(name)));
    }
  );

  it("writes a new profile in the canonical layout", () => {
    const markdown = serializeBlocks(profileTemplate("pt-BR"));
    expect(serializeBlocks(parseBlocks(markdown))).toBe(markdown);
    expect(markdown).toContain(
      "## Experiência (mais recente primeiro)\n\n## Formação"
    );
  });

  it("reads nested results and keeps them one level under their label", () => {
    const blocks = parseBlocks(
      "- Resultados:\n    - um [medido]\n  - dois [sem número]\n"
    );
    expect(blocks).toEqual([
      { type: "item", depth: 0, text: "Resultados:" },
      { type: "item", depth: 1, text: "um [medido]" },
      { type: "item", depth: 1, text: "dois [sem número]" },
    ]);
  });
});
