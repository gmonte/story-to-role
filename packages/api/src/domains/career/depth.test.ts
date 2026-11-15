import { describe, expect, it } from "vitest";

import { computeDepth, type DepthInput } from "./depth";

const base: DepthInput = {
  hasDates: true,
  scriptKind: "full",
  approved: false,
  reachedContext: false,
  storyCount: 0,
  achievements: [],
  toolCount: 0,
  sensitivePending: 0,
};

describe("position depth", () => {
  it("starts at confirmed when an import gave employer, title and dates", () => {
    expect(computeDepth(base).level).toBe("confirmed");
    expect(computeDepth({ ...base, hasDates: false }).level).toBeNull();
  });

  it("climbs the script's levels, never as a percentage", () => {
    expect(computeDepth({ ...base, reachedContext: true }).level).toBe(
      "contextualized"
    );
    expect(
      computeDepth({ ...base, reachedContext: true, storyCount: 1 }).level
    ).toBe("with_stories");
    expect(
      computeDepth({
        ...base,
        reachedContext: true,
        storyCount: 1,
        achievements: ["Cut deploy time from 2h to 15min"],
        toolCount: 2,
      }).level
    ).toBe("evidenced");
    expect(
      computeDepth({
        ...base,
        reachedContext: true,
        storyCount: 1,
        achievements: ["Cut deploy time from 2h to 15min"],
        toolCount: 2,
        approved: true,
      }).level
    ).toBe("complete");
  });

  it("is not complete while sensitive items await review", () => {
    expect(
      computeDepth({
        ...base,
        reachedContext: true,
        storyCount: 1,
        achievements: ["Grew revenue 20%"],
        toolCount: 1,
        approved: true,
        sensitivePending: 1,
      }).level
    ).toBe("evidenced");
  });

  it("counts achievements without a number and nudges toward them", () => {
    const depth = computeDepth({
      ...base,
      achievements: [
        "Led the migration",
        "Grew revenue 20%",
        "Improved morale",
      ],
    });

    expect(depth.counts).toMatchObject({
      evidence: 3,
      resultsWithNumbers: 1,
    });
    expect(depth.nudge).toEqual({
      kind: "achievements_without_number",
      count: 2,
    });
  });

  it("counts only numbers that measure something", () => {
    const depth = computeDepth({
      ...base,
      achievements: [
        "Migrated the codebase to Python 3",
        "Mentored 4 engineers",
        "Saved R$ 2 mil",
      ],
    });
    expect(depth.counts.resultsWithNumbers).toBe(2);
  });

  it("treats a short-script position as done once it has stories", () => {
    expect(
      computeDepth({
        ...base,
        scriptKind: "short",
        reachedContext: true,
        storyCount: 1,
      })
    ).toMatchObject({ level: "with_stories", done: true });
  });
});
