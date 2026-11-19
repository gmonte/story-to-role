import { describe, expect, it } from "vitest";

import { docToMarkdown, markdownToDoc } from "./description-markdown";

describe("description markdown", () => {
  it("round-trips headings, lists and emphasis", () => {
    const markdown = [
      "# Platform Engineer",
      "We build **fast** and *careful* things.",
      "- Go\n- Postgres",
      "1. Apply\n2. Talk",
    ].join("\n\n");
    expect(docToMarkdown(markdownToDoc(markdown))).toBe(markdown);
  });

  it("reads a pasted posting's loose text and bullets", () => {
    const doc = markdownToDoc("About us\n\n• Remote\n• Equity");
    expect(doc.content?.map((node) => node.type)).toEqual([
      "paragraph",
      "bulletList",
    ]);
    expect(docToMarkdown(doc)).toBe("About us\n\n- Remote\n- Equity");
  });

  it("makes an empty document of nothing", () => {
    expect(docToMarkdown(markdownToDoc(""))).toBe("");
  });
});
