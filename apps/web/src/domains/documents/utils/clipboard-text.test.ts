import { describe, expect, it } from "vitest";

import { clipboardText } from "./clipboard-text";

describe("clipboardText", () => {
  it("starts each bullet with an explicit mark, one per line", () => {
    expect(
      clipboardText(
        [
          { bullet: false, text: "Acme" },
          { bullet: true, text: "Cut costs by 30%." },
          { bullet: true, text: "Led 5 engineers." },
          { bullet: false, text: "Globex" },
        ],
        false
      )
    ).toBe("Acme\n\n• Cut costs by 30%.\n• Led 5 engineers.\n\nGlobex");
  });

  it("copies part of one line without a mark", () => {
    expect(clipboardText([{ bullet: true, text: "costs by 30%" }], true)).toBe(
      "costs by 30%"
    );
  });
});
