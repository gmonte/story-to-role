import { describe, expect, it } from "vitest";

import { highlightAccount } from "./account-marks";

describe("highlightAccount", () => {
  it("marks a figure with the origin written after it", () => {
    expect(
      highlightAccount("Cut deploys by 40% [medido] in a quarter.")
    ).toEqual([
      { text: "Cut deploys by " },
      { text: "40%", figure: "measured" },
      { text: " " },
      { text: "[medido]", mark: "measured" },
      { text: " in a quarter." },
    ]);
  });

  it("leaves a figure unmarked when its sentence has no mark", () => {
    const figures = highlightAccount(
      "Led 6 engineers. Saved R$ 1.5 mil a month [estimado]."
    ).filter((segment) => "figure" in segment);
    expect(figures).toEqual([
      { text: "6", figure: "unmarked" },
      // A decimal point is not the end of a sentence.
      { text: "R$ 1.5 mil", figure: "estimated" },
    ]);
  });

  it("reads the marks in English too", () => {
    expect(
      highlightAccount("About 2 million users [no number]").filter(
        (segment) => "figure" in segment
      )
    ).toEqual([{ text: "2", figure: "no_number" }]);
  });
});
