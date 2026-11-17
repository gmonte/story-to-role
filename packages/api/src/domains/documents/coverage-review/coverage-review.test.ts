import { describe, expect, it } from "vitest";

import type { Purpose } from "../generation/assemble-resume";
import type { CareerContext } from "../generation/load-career-context";
import { purposesOf, type OpeningBrief } from "../generation/resume-prompts";
import type { ResumeContent } from "../schemas/resume-content";
import {
  type CoverageReviewDraft,
  coverageReviewPrompt,
  coverageStatements,
  keepReview,
} from "./coverage-review";

const P1 = "00000000-0000-4000-8000-000000000001";
const E1 = "00000000-0000-4000-8000-0000000000e1";
const E2 = "00000000-0000-4000-8000-0000000000e2";
const E9 = "00000000-0000-4000-8000-0000000000e9";
const I1 = "00000000-0000-4000-8000-0000000000a1";

const context: CareerContext = {
  profileVersionId: "00000000-0000-4000-8000-0000000000f1",
  profileVersionNumber: 2,
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
      notDone: [],
    },
  ],
  evidence: [
    {
      id: E1,
      positionId: P1,
      credentialId: null,
      projectId: null,
      kind: "achievement",
      text: "Cut deploy time by 40% with Kubernetes.",
      figures: "Cut deploy time by 40% with Kubernetes.",
    },
    {
      id: E2,
      positionId: P1,
      credentialId: null,
      projectId: null,
      kind: "tool",
      text: "Tools: Kubernetes, Terraform",
      figures: "Tools: Kubernetes, Terraform",
    },
  ],
  credentials: [],
  skills: [],
  projects: [],
  instructions: [
    { id: I1, positionId: P1, credentialId: null, text: "Led a team of 5." },
  ],
  evidenceOfPassage: new Map(),
  rules: { neverInclude: [], neverClaim: [] },
  studied: [],
  gaps: [],
};

const content: ResumeContent = {
  kind: "resume",
  header: {
    name: "Ana",
    titleLine: "Platform Engineer | Kubernetes",
    contacts: [],
    city: null,
  },
  sections: [
    {
      kind: "experience",
      entries: [
        {
          positionId: P1,
          employer: "Globex",
          title: "Tech Lead",
          startDate: "2021-03",
          endDate: null,
          context: null,
          lines: [
            {
              id: "deploy",
              text: "Cut deploy time by 40% with Kubernetes.",
              origin: { kind: "evidence", evidenceIds: [E1] },
            },
            {
              id: "team",
              text: "Led a team of 5 engineers.",
              origin: {
                kind: "instruction",
                instructionIds: [I1],
                evidenceIds: [],
              },
            },
            {
              id: "terraform",
              text: "Provisioned clusters with Terraform.",
              origin: { kind: "evidence", evidenceIds: [E2] },
            },
          ],
        },
      ],
    },
  ],
};

const brief: OpeningBrief = {
  title: "Platform Engineer",
  company: "Hooli",
  terms: [
    { kind: "keyword", category: "tool", text: "Kubernetes" },
    { kind: "keyword", category: "tool", text: "Terraform" },
    { kind: "keyword", category: "tool", text: "Leadership" },
    { kind: "keyword", category: "tool", text: "Go" },
  ],
  fitCheck: [
    { term: "Kubernetes", verdict: "met", evidenceIds: [E1] },
    { term: "Terraform", verdict: "met", evidenceIds: [E2] },
    { term: "Leadership", verdict: "partial", evidenceIds: [] },
    { term: "Go", verdict: "gap", evidenceIds: [] },
  ],
};
const purposes: Purpose[] = purposesOf(brief);

const empty: CoverageReviewDraft = {
  strong: [],
  partial: [],
  gaps: [],
  inconsistencies: [],
  suggestions: [],
};

const keep = (
  draft: Partial<CoverageReviewDraft>,
  language: "en-US" | "pt-BR" = "en-US"
) =>
  keepReview({
    draft: { ...empty, ...draft },
    content,
    context,
    brief,
    purposes,
    language,
  });

describe("what code keeps of the coverage review", () => {
  it("keeps a strong item only with a line that cites the profile line it names", () => {
    const review = keep({
      strong: [
        { requirement: "Kubernetes", line_id: "deploy", evidence_id: E1 },
        // The fit check ties E2 to Terraform though the line cites nothing of it.
        { requirement: "Terraform", line_id: "team", evidence_id: E2 },
        // A profile line the frozen version doesn't have.
        { requirement: "Leadership", line_id: "team", evidence_id: E9 },
      ],
    });
    expect(review.strong).toEqual([
      { requirement: "Kubernetes", lineId: "deploy", evidenceId: E1 },
      { requirement: "Terraform", lineId: "team", evidenceId: E2 },
    ]);
    expect(review.partial).toEqual([
      { requirement: "Leadership", explanation: "no evidence in the profile" },
    ]);
    // Every requirement left is a gap, by name: nothing invented or forgotten.
    expect(review.gaps).toEqual(["Go"]);
  });

  it("names a requirement as the opening writes it, never twice", () => {
    const review = keep({
      strong: [
        // The model's own wording, matched back to the opening's.
        { requirement: "kubernetes", line_id: "deploy", evidence_id: E1 },
      ],
      partial: [
        // Not a requirement of the opening: dropped.
        { requirement: "Communication", explanation: "Shown in a bullet." },
      ],
    });
    expect(review.strong).toEqual([
      { requirement: "Kubernetes", lineId: "deploy", evidenceId: E1 },
    ]);
    expect(review.partial).toEqual([]);
    expect(review.gaps).toEqual(["Terraform", "Leadership", "Go"]);
  });

  it("leaves location and work model out: the job preferences answer them", () => {
    const review = keepReview({
      draft: {
        ...empty,
        partial: [
          {
            requirement: "Remote in Brazil",
            explanation: "Not in the profile.",
          },
        ],
      },
      content,
      context,
      brief: {
        ...brief,
        terms: [
          ...brief.terms,
          {
            kind: "requirement",
            category: "work_model",
            text: "Remote in Brazil",
          },
        ],
      },
      purposes,
      language: "en-US",
    });
    expect(review.partial).toEqual([]);
    expect(review.gaps).not.toContain("Remote in Brazil");
  });

  it("demotes a strong item whose line is not in the document", () => {
    const review = keep({
      strong: [
        { requirement: "Kubernetes", line_id: "nowhere", evidence_id: E1 },
      ],
      partial: [
        { requirement: "Leadership", explanation: "Only the team size." },
      ],
    });
    expect(review.strong).toEqual([]);
    expect(review.partial).toEqual([
      { requirement: "Kubernetes", explanation: "no evidence in the profile" },
      { requirement: "Leadership", explanation: "Only the team size." },
    ]);
    expect(review.gaps).toEqual(["Terraform", "Go"]);
  });

  it("never suggests covering a gap, nor adding anything", () => {
    const review = keep({
      strong: [
        { requirement: "Kubernetes", line_id: "deploy", evidence_id: E1 },
        { requirement: "Terraform", line_id: "terraform", evidence_id: E2 },
      ],
      partial: [{ requirement: "Leadership", explanation: "Team size only." }],
      suggestions: [
        {
          kind: "reorder",
          line_id: "terraform",
          text: "Bring the Terraform line first.",
        },
        // Go is a gap of the fit check and of this review.
        { kind: "reorder", line_id: null, text: "Mention Go in the summary." },
        { kind: "reorder", line_id: null, text: "Reorder to show Go early." },
        {
          kind: "reorder",
          line_id: null,
          text: "Add a bullet on Terraform modules.",
        },
        {
          kind: "reorder",
          line_id: null,
          text: "Open with the leadership line.",
        },
      ],
    });
    expect(review.gaps).toEqual(["Go"]);
    expect(review.suggestions).toEqual([
      {
        kind: "reorder",
        lineId: "terraform",
        text: "Bring the Terraform line first.",
      },
      { kind: "reorder", lineId: null, text: "Open with the leadership line." },
    ]);
  });

  it("keeps a profile suggestion only for a bullet in the user's own words", () => {
    const review = keep({
      suggestions: [
        {
          kind: "profile",
          line_id: "team",
          text: "Add the team of 5 to the Globex results.",
        },
        // Already in the profile: nothing to send.
        {
          kind: "profile",
          line_id: "deploy",
          text: "Add the deploy time result.",
        },
        { kind: "profile", line_id: null, text: "Update the profile." },
      ],
    });
    expect(review.suggestions).toEqual([
      {
        kind: "profile",
        lineId: "team",
        text: "Add the team of 5 to the Globex results.",
      },
    ]);
  });

  it("keeps inconsistencies only on lines of the document", () => {
    const review = keep({
      inconsistencies: [
        { line_id: "team", explanation: "The profile says 4." },
        { line_id: "ghost", explanation: "Nothing." },
      ],
    });
    expect(review.inconsistencies).toEqual([
      { lineId: "team", explanation: "The profile says 4." },
    ]);
  });

  it("writes the sources, what was preserved and the statement by code, in the document's language", () => {
    const english = keep({});
    expect(english.sources).toEqual({
      profileVersionNumber: 2,
      purpose: {
        kind: "opening",
        title: "Platform Engineer",
        company: "Hooli",
      },
      instructions: 1,
    });
    expect(english.preserved).toEqual([
      {
        positionId: P1,
        employer: "Globex",
        title: "Tech Lead",
        startDate: "2021-03",
        endDate: null,
        bullets: 3,
      },
    ]);
    expect(english.statement).toBe(
      "This review does not claim that every mandatory requirement is met."
    );
    expect(keep({}, "pt-BR").statement).toBe(
      "Esta revisão não afirma que todos os requisitos obrigatórios são atendidos."
    );
    expect(
      keep(
        {
          strong: [
            { requirement: "Kubernetes", line_id: "x", evidence_id: E1 },
          ],
        },
        "pt-BR"
      ).partial
    ).toEqual([
      { requirement: "Kubernetes", explanation: "sem evidência no perfil" },
    ]);
    expect(Object.keys(coverageStatements)).toEqual(["en-US", "pt-BR"]);
  });

  it("takes a focus's gaps as the model lists them", () => {
    const focused: OpeningBrief = {
      title: "Platform",
      company: null,
      terms: [],
      fitCheck: [],
      focus: "Platform",
    };
    const review = keepReview({
      draft: {
        ...empty,
        gaps: ["Cloud cost control", " ", "Cloud cost control"],
      },
      content,
      context,
      brief: focused,
      purposes: purposesOf(focused),
      language: "en-US",
    });
    expect(review.gaps).toEqual(["Cloud cost control"]);
    expect(review.sources.purpose).toEqual({
      kind: "focus",
      focus: "Platform",
    });
  });

  it("shows the reviewer the lines with their ids and only the profile lines in play", () => {
    const prompt = coverageReviewPrompt({
      content,
      context,
      brief,
      language: "pt-BR",
    });
    expect(prompt).toContain(
      "[deploy] Cut deploy time by 40% with Kubernetes."
    );
    expect(prompt).toContain(`- line ${E1} (Tech Lead at Globex)`);
    expect(prompt).toContain("- gap: Go");
    expect(prompt).toContain(`- instruction ${I1}`);
    expect(prompt).toContain("Brazilian Portuguese");
  });
});
