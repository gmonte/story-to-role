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
    ).toEqual([{ text: "2 million", figure: "no_number" }]);
  });

  it("keeps a mark to its own clause", () => {
    expect(
      highlightAccount(
        "Led 6 engineers and cut costs by 40% [medido], from 2 hours to 15 minutes [estimado]."
      ).filter((segment) => "figure" in segment)
    ).toEqual([
      { text: "6", figure: "unmarked" },
      { text: "40%", figure: "measured" },
      { text: "2", figure: "estimated" },
      { text: "15", figure: "estimated" },
    ]);
  });

  it("leaves years alone and keeps word multipliers", () => {
    expect(
      highlightAccount(
        "In 2021 I joined; it served 2 million users [medido]."
      ).filter((segment) => "figure" in segment)
    ).toEqual([{ text: "2 million", figure: "measured" }]);
  });
});
