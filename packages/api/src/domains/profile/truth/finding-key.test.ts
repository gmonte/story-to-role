import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseBlocks } from "./blocks";
import {
  findingKey,
  findingKeys,
  sha256Hex,
  withoutDismissed,
} from "./finding-key";

describe("finding key", () => {
  it("is sha-256, for short and block-spanning texts", () => {
    for (const text of ["", "abc", "ação — 日本語", "x".repeat(200)]) {
      expect(sha256Hex(text)).toBe(
        createHash("sha256").update(text).digest("hex")
      );
    }
  });

  it("follows the text the finding covers, not the rest of the line", () => {
    const finding = {
      code: "competencyMissing",
      kind: "content",
      line: 1,
      from: 4,
      to: 9,
      fixable: false,
      params: { name: "Redux" },
    } as const;
    const first = parseBlocks("# Perfil\n\nUsei Redux no app");
    const key = findingKey(finding, first);
    expect(key).toHaveLength(16);
    expect(findingKey(finding, first)).toBe(key);
    expect(
      findingKey(finding, parseBlocks("# Perfil\n\nUsei Redux no app e na web"))
    ).toBe(key);
    expect(
      findingKey(finding, parseBlocks("# Perfil\n\nUsei Redix no app"))
    ).not.toBe(key);
  });

  it("still hides a finding ignored under the old whole-line key", () => {
    const finding = {
      code: "competencyMissing",
      kind: "content",
      line: 1,
      from: 4,
      to: 9,
      fixable: false,
      params: { name: "Redux" },
    } as const;
    const blocks = parseBlocks("# Perfil\n\nUsei Redux no app");
    const [, old] = findingKeys(finding, blocks);
    expect(withoutDismissed([finding], blocks, [old])).toEqual([]);
  });
});
