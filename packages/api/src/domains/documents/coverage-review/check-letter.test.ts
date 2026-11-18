import { describe, expect, it } from "vitest";

import type { CareerContext } from "../generation/load-career-context";
import type { CoverLetterContent } from "../schemas/cover-letter-content";
import { defaultGenerationSettings } from "../schemas/generation-settings";
import { checkLetter } from "./check-letter";

const P1 = "00000000-0000-4000-8000-000000000001";
const E1 = "00000000-0000-4000-8000-0000000000e1";
const E2 = "00000000-0000-4000-8000-0000000000e2";
const I1 = "00000000-0000-4000-8000-0000000000a1";

const context: CareerContext = {
  profileVersionId: "00000000-0000-4000-8000-0000000000f1",
  profileVersionNumber: 3,
  header: {
    name: "Ana",
    email: "",
    phone: "",
    linkedin: "",
    github: "",
    city: "",
  },
  acceptedTitles: new Map(),
  positions: [
    {
      id: P1,
      employer: "Globex",
      title: "Tech Lead",
      startDate: "2021-03",
      endDate: null,
      notDone: ["Did not run Terraform in production."],
    },
  ],
  evidence: [
    {
      id: E1,
      positionId: P1,
      credentialId: null,
      projectId: null,
      kind: "achievement",
      text: "Cut deploy time by 40%.",
      figures: "Cut deploy time by 40%.",
    },
    {
      id: E2,
      positionId: P1,
      credentialId: null,
      projectId: null,
      kind: "tool",
      text: "Tools: Kubernetes",
      figures: "Tools: Kubernetes",
    },
  ],
  credentials: [],
  skills: [
    { id: "s1", name: "Kubernetes", evidenceIds: [] },
    { id: "s2", name: "Terraform", evidenceIds: [] },
  ],
  projects: [],
  instructions: [
    { id: I1, positionId: P1, credentialId: null, text: "I led 5 people." },
  ],
  evidenceOfPassage: new Map(),
  rules: { neverInclude: ["Hooli"], neverClaim: [], publicNames: [] },
  studied: ["Rust"],
  gaps: [],
  careerDirection: [],
};

const letter = (
  paragraphs: Array<{
    id: string;
    text: string;
    evidenceIds?: string[];
    instructionIds?: string[];
  }>
): CoverLetterContent => ({
  kind: "cover_letter",
  header: { name: "Ana", titleLine: "", contacts: [], city: null },
  greeting: "Dear team,",
  paragraphs: paragraphs.map((row) => ({
    id: row.id,
    text: row.text,
    origin: {
      kind: "letter" as const,
      evidenceIds: row.evidenceIds ?? [],
      companyFactIds: [],
      motivationPointIds: [],
      instructionIds: row.instructionIds ?? [],
    },
  })),
  closing: "Sincerely,",
});

const check = (content: CoverLetterContent, pages: number | null = null) =>
  checkLetter({
    content,
    context,
    settings: { ...defaultGenerationSettings, letterMaxParagraphs: 2 },
    ownSources: ["Hooli opened an office in 2026."],
    pages,
  }).map((finding) => [finding.code, finding.lineId]);

describe("the cover letter's code checks", () => {
  it("passes a letter within its settings that shows only measured figures", () => {
    expect(
      check(
        letter([
          {
            id: "a",
            text: "At Globex I cut deploy time by 40%, since 2021.",
            evidenceIds: [E1],
          },
          { id: "b", text: "I led 5 people.", instructionIds: [I1] },
        ]),
        1
      )
    ).toEqual([]);
  });

  it("blocks a figure the profile doesn't show, a mark, and too many paragraphs or pages", () => {
    expect(
      check(
        letter([
          { id: "a", text: "I cut costs by 30%.", evidenceIds: [E1] },
          { id: "b", text: "Cost went down [estimated].", evidenceIds: [E1] },
          { id: "c", text: "Hello.", evidenceIds: [E1] },
        ]),
        2
      )
    ).toEqual([
      ["paragraphs", null],
      ["pages", null],
      ["figure", "a"],
      ["figure", "b"],
    ]);
  });

  it("backs a paragraph's figures by what it cites; a hand-written one by any measured line", () => {
    const cited = (
      id: string,
      text: string,
      evidenceIds: string[]
    ): CoverLetterContent => letter([{ id, text, evidenceIds }]);
    // E2 shows no 40%: citing only it, the figure is not backed.
    expect(check(cited("a", "I cut deploy time by 40%.", [E2]))).toEqual([
      ["figure", "a"],
    ]);
    expect(check(cited("a", "I cut deploy time by 40%.", [E1]))).toEqual([]);
    // Written by hand: no citations, any measured profile line backs it.
    const manual = letter([{ id: "a", text: "x", evidenceIds: [] }]);
    manual.paragraphs[0] = {
      id: "a",
      text: "I cut deploy time by 40%.",
      origin: { kind: "manual" },
    };
    expect(check(manual)).toEqual([]);
  });

  it("blocks forbidden terms and what a position says the person did not do", () => {
    expect(
      check(
        letter([
          { id: "a", text: "I applied to Hooli.", evidenceIds: [E1] },
          { id: "b", text: "I run Terraform daily.", evidenceIds: [E1] },
          { id: "c", text: "I am learning Rust." },
        ])
      )
    ).toEqual([
      ["paragraphs", null],
      ["neverInclude", "a"],
      ["notDone", "b"],
      ["studied", "c"],
    ]);
  });
});
