import { describe, expect, it } from "vitest";

import { findLinks } from "./find-links";

const hrefs = (text: string) => findLinks(text).map((l) => l.href);

describe("findLinks", () => {
  it("finds http(s) URLs with offsets", () => {
    const text = "LinkedIn: https://linkedin.com/in/ana";
    expect(findLinks(text)).toEqual([
      { from: 10, to: text.length, href: "https://linkedin.com/in/ana" },
    ]);
  });

  it("leaves trailing punctuation out", () => {
    expect(hrefs("see https://a.com/x, and (https://b.com/y).")).toEqual([
      "https://a.com/x",
      "https://b.com/y",
    ]);
    expect(hrefs("https://a.com/p_(x)")).toEqual(["https://a.com/p_(x)"]);
  });

  it("adds https:// to bare domains", () => {
    expect(hrefs("www.ana.dev")).toEqual(["https://www.ana.dev"]);
    expect(hrefs("github.com/ana.")).toEqual(["https://github.com/ana"]);
  });

  it("ignores bare domains without a path", () => {
    expect(hrefs("I use node.js and ana.dev daily")).toEqual([]);
  });

  it("uses mailto: for e-mails and doesn't split them", () => {
    expect(hrefs("Email: ana.s@mail.example.com.")).toEqual([
      "mailto:ana.s@mail.example.com",
    ]);
  });

  it("doesn't double count a URL's host", () => {
    expect(findLinks("https://github.com/ana")).toHaveLength(1);
  });
});
