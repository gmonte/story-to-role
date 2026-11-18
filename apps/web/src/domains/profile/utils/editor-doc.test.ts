import { describe, expect, it } from "vitest";

import type { ProfileBlock } from "@repo/api/domains/profile/truth/blocks";

import { isLockedHeading, lockedHeadingsOf } from "./editor-doc";

describe("locked headings", () => {
  it("locks the title and the recognised sections only", () => {
    expect(isLockedHeading(1, "Maria")).toBe(true);
    expect(isLockedHeading(2, "Experiência (mais recente primeiro)")).toBe(
      true
    );
    expect(isLockedHeading(2, "Hobbies")).toBe(false);
    expect(isLockedHeading(3, "Acme — Dev")).toBe(false);
  });

  it("lists them in order, so a reorder or an edit shows", () => {
    const blocks: ProfileBlock[] = [
      { type: "heading", level: 1, text: "Maria" },
      { type: "heading", level: 2, text: "Education" },
      { type: "heading", level: 2, text: "Hobbies" },
      { type: "paragraph", text: "text" },
      { type: "heading", level: 2, text: "Experience" },
    ];
    expect(lockedHeadingsOf(blocks)).toEqual([
      "1:Maria",
      "2:Education",
      "2:Experience",
    ]);
  });
});
