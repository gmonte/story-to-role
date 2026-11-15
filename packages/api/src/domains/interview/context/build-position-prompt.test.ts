import { describe, expect, it } from "vitest";

import {
  buildPositionPrompt,
  type PositionPromptInput,
} from "./build-position-prompt";

const input: PositionPromptInput = {
  language: "pt-BR",
  scriptKind: "full",
  stage: "stories",
  target: {
    kind: "position",
    position: {
      id: "p2",
      employer: "Acme",
      title: "Staff Engineer",
      startDate: "2021-01",
      endDate: null,
      status: "in_progress",
    },
    location: "São Paulo",
  },
  timeline: [
    {
      id: "p2",
      employer: "Acme",
      title: "Staff Engineer",
      startDate: "2021-01",
      endDate: null,
      status: "in_progress",
    },
    {
      id: "p1",
      employer: "Globex",
      title: "Engineer",
      startDate: "2017-03",
      endDate: "2020-12",
      status: "approved",
    },
  ],
  neighbourSummaries: [
    { label: "Engineer at Globex", summary: "Built the billing system." },
  ],
  knownFacts: ["achievement: Cut deploy time from 2h to 15min"],
  draftFacts: ["tool: Kubernetes"],
  notesFromOtherPositions: ["Mentioned leading on-call at Acme"],
  conflicts: [
    { id: "c1", field: "startDate", options: ["2021-01", "2020-11"] },
  ],
  currentProject: "Platform migration",
};

describe("position agent prompt", () => {
  it("puts stable instructions and the timeline before the position's own facts", () => {
    const prompt = buildPositionPrompt(input);

    expect(prompt.indexOf("Career timeline")).toBeLessThan(
      prompt.indexOf("Already approved")
    );
    expect(prompt).toContain(
      "p1: Engineer at Globex (2017-03 to 2020-12) [approved]"
    );
    expect(prompt).toContain("Engineer at Globex: Built the billing system.");
    expect(prompt).toContain("Converse in Brazilian Portuguese.");
    expect(prompt).toContain("Current stage: stories.");
    expect(prompt).toContain("- c1: startDate: 2021-01 or 2020-11");
    expect(prompt).toContain(
      "Current project (subsession): Platform migration."
    );
  });

  it("uses the short script for short positions and credentials", () => {
    expect(buildPositionPrompt({ ...input, scriptKind: "short" })).toContain(
      "Use the short script"
    );
    expect(
      buildPositionPrompt({
        ...input,
        target: { kind: "credential", title: "MSc Thesis", institution: "USP" },
      })
    ).toContain("MSc Thesis (USP)");
  });

  it("asks a user with no positions what they want to work with", () => {
    expect(
      buildPositionPrompt({ ...input, target: { kind: "no_positions" } })
    ).toContain("what they want to work with");
  });
});
