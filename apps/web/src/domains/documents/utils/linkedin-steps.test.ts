import { describe, expect, it } from "vitest";

import type { LinkedinContent } from "@repo/api/domains/documents/schemas/linkedin-content";

import { linkedinSteps, openStep } from "./linkedin-steps";

const line = (id: string, text: string) => ({
  id,
  text,
  origin: { kind: "manual" as const },
});

const started: LinkedinContent = {
  kind: "linkedin",
  headline: null,
  headlineOptions: [],
  about: line("about", ""),
  experiences: [
    {
      positionId: "11111111-1111-4111-8111-111111111111",
      employer: "Globex",
      title: "Tech Lead",
      startDate: "2021-03",
      endDate: null,
      lines: [],
    },
  ],
  projects: [],
  education: [],
  certifications: [],
  languages: [],
};

describe("LinkedIn steps", () => {
  it("lists a step per section the profile has, the empty ones left out", () => {
    expect(linkedinSteps(started).map((step) => step.key)).toEqual([
      "headline",
      "about",
      "experiences",
      "credentials",
    ]);
  });

  it("marks what is written and opens the first step still to write", () => {
    const steps = linkedinSteps({
      ...started,
      headline: line("h", "Tech Lead"),
      headlineOptions: [line("h", "Tech Lead")],
    });
    expect(steps.map((step) => [step.key, step.written])).toEqual([
      ["headline", true],
      ["about", false],
      ["experiences", false],
      ["credentials", false],
    ]);
    expect(openStep(steps)).toBe("about");
  });

  it("each AI step names the section it writes; credentials need no AI", () => {
    expect(
      linkedinSteps(started).map((step) => [step.key, step.section])
    ).toEqual([
      ["headline", "headline"],
      ["about", "about"],
      ["experiences", "experiences"],
      ["credentials", null],
    ]);
  });
});
