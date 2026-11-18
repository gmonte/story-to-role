import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseBlocks } from "./blocks";
import { findingKey, sha256Hex } from "./finding-key";

describe("finding key", () => {
  it("is sha-256, for short and block-spanning texts", () => {
    for (const text of ["", "abc", "ação — 日本語", "x".repeat(200)]) {
      expect(sha256Hex(text)).toBe(
        createHash("sha256").update(text).digest("hex")
      );
    }
  });

  it("changes when the line is edited", () => {
    const finding = {
      code: "missingNotDone",
      kind: "content",
      line: 1,
      from: 0,
      to: 3,
      fixable: false,
    } as const;
    const first = parseBlocks("# Perfil\n\nxyz");
    const key = findingKey(finding, first);
    expect(key).toHaveLength(16);
    expect(findingKey(finding, first)).toBe(key);
    expect(findingKey(finding, parseBlocks("# Perfil\n\nxyzw"))).not.toBe(key);
  });
});
