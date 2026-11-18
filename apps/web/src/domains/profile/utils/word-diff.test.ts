import { describe, expect, it } from "vitest";

import { lineDiff, wordDiff } from "./word-diff";

const changed = (segments: Array<{ text: string; changed: boolean }>) =>
  segments.filter((s) => s.changed).map((s) => s.text);

describe("wordDiff", () => {
  it("flags nothing for identical text", () => {
    const diff = wordDiff("Built the API", "Built the API");
    expect(changed(diff.old)).toEqual([]);
    expect(changed(diff.new)).toEqual([]);
    expect(diff.similarity).toBe(1);
    expect(diff.fallback).toBe(false);
  });

  it("flags one changed word on each side", () => {
    const diff = wordDiff(
      "Led a small team of engineers daily",
      "Led a large team of engineers daily"
    );
    expect(changed(diff.old)).toEqual(["small"]);
    expect(changed(diff.new)).toEqual(["large"]);
    expect(diff.old.map((s) => s.text).join("")).toBe(
      "Led a small team of engineers daily"
    );
  });

  it("flags an insertion at the end", () => {
    const diff = wordDiff(
      "Built the API and the web app",
      "Built the API and the web app in Go"
    );
    expect(changed(diff.old)).toEqual([]);
    expect(changed(diff.new)).toEqual([" in Go"]);
  });

  it("treats punctuation as its own token", () => {
    const diff = wordDiff(
      "Built the API, shipped it",
      "Built the API; shipped it"
    );
    expect(changed(diff.old)).toEqual([","]);
    expect(changed(diff.new)).toEqual([";"]);
  });

  it("flags a fallback for low similarity or an empty side", () => {
    expect(
      wordDiff("alpha beta gamma delta", "one two three four").fallback
    ).toBe(true);
    expect(wordDiff("", "something new").fallback).toBe(true);
    expect(wordDiff("something old", "").fallback).toBe(true);
  });
});

describe("lineDiff", () => {
  it("diffs per line when the counts match", () => {
    const diff = lineDiff(
      ["Led the team well", "Built the API"],
      ["Led the team often", "Built the API"]
    );
    expect(diff.fallback).toBe(false);
    expect(changed(diff.old[0])).toEqual(["well"]);
    expect(diff.old[1]).toEqual([{ text: "Built the API", changed: false }]);
  });

  it("diffs the whole passage when the counts differ", () => {
    const diff = lineDiff(
      ["Led the team well", "Built the API"],
      ["Led the team well and Built the API"]
    );
    expect(diff.fallback).toBe(false);
    expect(diff.old).toHaveLength(2);
    expect(diff.new).toHaveLength(1);
  });

  it("falls back to whole lines when an empty side", () => {
    const diff = lineDiff([], ["New line"]);
    expect(diff.fallback).toBe(true);
    expect(diff.new).toEqual([[{ text: "New line", changed: false }]]);
  });
});
