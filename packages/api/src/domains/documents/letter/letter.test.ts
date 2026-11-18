import { describe, expect, it } from "vitest";

import type { CoverLetterContent } from "../schemas/cover-letter-content";
import {
  applyLetterEdit,
  assembleLetter,
  estimateLetterPages,
  type LetterDraft,
  type LetterSources,
} from "./assemble-letter";

const E1 = "00000000-0000-4000-8000-0000000000e1";
const E2 = "00000000-0000-4000-8000-0000000000e2";
const F1 = "00000000-0000-4000-8000-0000000000f1";
const M1 = "00000000-0000-4000-8000-0000000000d1";
const I1 = "00000000-0000-4000-8000-0000000000a1";

const sources: LetterSources = {
  evidence: [
    {
      id: E1,
      text: "Moved 12 services to Kubernetes, cutting deploys from 2 hours to 15 minutes",
    },
    {
      // The estimate is withheld from the writer: its figures aren't shown.
      id: E2,
      text: "Cut cloud costs [figure withheld]",
      figures: "Cut cloud costs",
    },
  ],
  companyFacts: [{ id: F1, text: "Hooli opened a Lisbon office in 2026." }],
  motivationPoints: [{ id: M1, text: "I use the product every time I travel" }],
  instructions: [{ id: I1, text: "I managed 8 people at Globex" }],
};

const header = {
  name: "Ana Souza",
  titleLine: "Platform Engineer",
  contacts: [],
  city: null,
};

const draft = (paragraphs: LetterDraft["paragraphs"]): LetterDraft => ({
  greeting: "Dear Hooli team,",
  paragraphs,
  closing: "Sincerely,",
});

const paragraph = (
  text: string,
  ids: Partial<
    Record<
      | "evidence_ids"
      | "company_fact_ids"
      | "motivation_point_ids"
      | "instruction_ids",
      string[]
    >
  >
) => ({
  text,
  evidence_ids: [],
  company_fact_ids: [],
  motivation_point_ids: [],
  instruction_ids: [],
  ...ids,
});

describe("assembling a cover letter", () => {
  it("keeps paragraphs that cite their sources and traces them", () => {
    const { content, refused } = assembleLetter({
      draft: draft([
        paragraph(
          "When Hooli opened its Lisbon office in 2026, I saw a team I want to join.",
          {
            company_fact_ids: [F1],
            instruction_ids: [I1],
          }
        ),
        paragraph(
          "At Globex I moved 12 services to Kubernetes, and deploys went from 2 hours to 15 minutes.",
          {
            evidence_ids: [E1],
          }
        ),
      ]),
      sources,
      header,
      language: "en-US",
    });
    expect(refused).toEqual([]);
    expect(content.paragraphs.map((line) => line.origin)).toEqual([
      {
        kind: "letter",
        evidenceIds: [],
        companyFactIds: [F1],
        motivationPointIds: [],
        instructionIds: [I1],
      },
      {
        kind: "letter",
        evidenceIds: [E1],
        companyFactIds: [],
        motivationPointIds: [],
        instructionIds: [],
      },
    ]);
    expect(content.header).toEqual(header);
    // Signed with the name printed in the header.
    expect(content.closing).toBe("Sincerely,\nAna Souza");
    // A placeholder never reaches the letter.
    const placeholder = assembleLetter({
      draft: { ...draft([]), closing: "Best regards,\n[Your Name]" },
      sources,
      header,
      language: "en-US",
    }).content;
    expect(placeholder.closing).toBe("Best regards,\nAna Souza");
  });

  it("refuses paragraphs without sources, with unknown ids or unsupported figures", () => {
    const { content, refused } = assembleLetter({
      draft: draft([
        paragraph("I am passionate about scale.", {}),
        paragraph("I led a team of 40.", { evidence_ids: [E1] }),
        paragraph("Hooli is the best.", {
          company_fact_ids: ["00000000-0000-4000-8000-000000000999"],
        }),
        paragraph("I use Hooli every time I travel.", {
          motivation_point_ids: [M1],
        }),
      ]),
      sources,
      header,
      language: "en-US",
    });
    expect(refused.map((row) => row.reason)).toEqual([
      "no_source",
      "unsupported_figure",
      "no_source",
    ]);
    expect(content.paragraphs.map((line) => line.text)).toEqual([
      "I use Hooli every time I travel.",
    ]);
  });

  it("rests on the user's instructions, and carries only figures its sources show", () => {
    const { content, refused } = assembleLetter({
      draft: draft([
        paragraph("At Globex I managed 8 people.", { instruction_ids: [I1] }),
        // The estimate was withheld from the writer: its figure isn't shown.
        paragraph("I cut cloud costs by 30%.", { evidence_ids: [E2] }),
        paragraph("I cut cloud costs [estimated].", { evidence_ids: [E2] }),
        paragraph("Since 2021 I have led Kubernetes work.", {
          evidence_ids: [E1],
        }),
      ]),
      sources,
      header,
      years: ["2021-03 "],
      language: "en-US",
    });
    expect(refused.map((row) => row.reason)).toEqual([
      "unsupported_figure",
      "unsupported_figure",
    ]);
    expect(content.paragraphs.map((line) => line.origin)).toEqual([
      expect.objectContaining({ kind: "letter", instructionIds: [I1] }),
      expect.objectContaining({ evidenceIds: [E1] }),
    ]);
  });

  it("refuses a paragraph the rules forbid, given what it cites", () => {
    const { refused } = assembleLetter({
      draft: draft([
        paragraph("I used Hooli every day.", { motivation_point_ids: [M1] }),
        paragraph("I used Terraform.", { evidence_ids: [E1] }),
      ]),
      sources,
      header,
      language: "en-US",
      isForbidden: (text, cited) =>
        text.includes("Hooli") ||
        (text.includes("Terraform") && cited.evidenceIds.includes(E1)),
    });
    expect(refused.map((row) => row.reason)).toEqual([
      "forbidden_term",
      "forbidden_term",
    ]);
  });

  it("estimates a long letter over one page", () => {
    const long = assembleLetter({
      draft: draft(
        Array.from({ length: 20 }, () =>
          paragraph(
            "At Globex I moved 12 services to Kubernetes and deploys went from 2 hours to 15 minutes, which changed how the whole team shipped work every single week.",
            { evidence_ids: [E1] }
          )
        )
      ),
      sources,
      header,
      language: "en-US",
    }).content;
    expect(estimateLetterPages(long)).toBeGreaterThan(1);
  });
});

describe("editing a cover letter", () => {
  const base: CoverLetterContent = {
    kind: "cover_letter",
    header,
    greeting: "Dear team,",
    paragraphs: [
      {
        id: "p1",
        text: "First.",
        origin: {
          kind: "letter",
          evidenceIds: [E1],
          companyFactIds: [],
          motivationPointIds: [],
          instructionIds: [],
        },
      },
      {
        id: "p2",
        text: "Second.",
        origin: {
          kind: "letter",
          evidenceIds: [],
          companyFactIds: [F1],
          motivationPointIds: [],
          instructionIds: [],
        },
      },
    ],
    closing: "Sincerely,",
  };

  it("keeps a reworded paragraph's sources as edited and marks a new one as the user's own", () => {
    const edited = applyLetterEdit(base, {
      ...base,
      greeting: "Hello Hooli,",
      paragraphs: [
        { ...base.paragraphs[0], text: "First." },
        { ...base.paragraphs[1], text: "Second, reworded." },
        { id: "p3", text: "Third.", origin: { kind: "manual" } },
      ],
    });
    expect(edited.greeting).toBe("Hello Hooli,");
    expect(edited.paragraphs.map((line) => line.origin)).toEqual([
      base.paragraphs[0].origin,
      {
        kind: "edited",
        evidenceIds: [],
        companyFactIds: [F1],
        motivationPointIds: [],
        instructionIds: [],
      },
      { kind: "manual" },
    ]);
  });

  it("lets an edit change the header: the document is the user's", () => {
    const edited = applyLetterEdit(base, {
      ...base,
      header: { ...header, name: "Someone Else" },
    });
    expect(edited.header.name).toBe("Someone Else");
  });
});
