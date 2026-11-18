import { describe, expect, it } from "vitest";

import type { CoverLetterContent } from "@repo/api/domains/documents/schemas/cover-letter-content";
import type { ResumeContent } from "@repo/api/domains/documents/schemas/resume-content";

import {
  blocksToContent,
  contentToBlocks,
  isEditableBlock,
  linesById,
  type DocumentBlock,
} from "./document-blocks";

const positionId = "11111111-1111-4111-8111-111111111111";
const credentialId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";
const evidenceId = "44444444-4444-4444-8444-444444444444";

const resume: ResumeContent = {
  kind: "resume",
  header: {
    name: "Ada Lovelace",
    titleLine: "Platform Engineer | Kubernetes",
    contacts: ["ada@example.com", "+55 31 99999-0000"],
    city: "Belo Horizonte, MG",
  },
  sections: [
    {
      kind: "summary",
      line: {
        id: "summary",
        text: "Engineer who cut deploy time by 40%.",
        origin: { kind: "evidence", evidenceIds: [evidenceId] },
      },
    },
    {
      kind: "skills",
      groups: [
        {
          id: "core",
          label: "Core",
          text: "Kubernetes, Terraform",
          origin: { kind: "skill", evidenceIds: [evidenceId] },
        },
      ],
    },
    {
      kind: "experience",
      entries: [
        {
          positionId,
          employer: "Globex",
          title: "Tech Lead",
          startDate: "2021-03",
          endDate: null,
          context: "parallel project",
          relevance: null,
          lines: [
            {
              id: "b1",
              text: "Cut deploy time by 40%.",
              origin: { kind: "evidence", evidenceIds: [evidenceId] },
            },
            {
              id: "b2",
              text: "Led a team of 5 engineers.",
              origin: { kind: "manual" },
            },
          ],
        },
      ],
    },
    {
      kind: "projects",
      entries: [
        {
          projectId,
          name: "Side project",
          lines: [
            { id: "p1", text: "Built a thing.", origin: { kind: "manual" } },
          ],
        },
      ],
    },
    {
      kind: "education",
      entries: [
        {
          credentialId,
          title: "Computer Science",
          institution: "UFMG",
          level: "BSc",
          startDate: "2010-02",
          endDate: "2014-12",
          inProgress: false,
        },
      ],
    },
  ],
};

const letter: CoverLetterContent = {
  kind: "cover_letter",
  header: resume.header,
  greeting: "Dear hiring team,",
  paragraphs: [
    {
      id: "l1",
      text: "I build platforms.",
      origin: {
        kind: "letter",
        evidenceIds: [evidenceId],
        companyFactIds: [],
        motivationPointIds: [],
        instructionIds: [],
      },
    },
    { id: "l2", text: "I would love to join.", origin: { kind: "manual" } },
  ],
  closing: "Kind regards, Ada",
};

describe("contentToBlocks", () => {
  it("prints a resume as the PDF does: header, sections, locked facts", () => {
    const blocks = contentToBlocks(resume, "en-US");
    expect(blocks.map((block) => block.type)).toEqual([
      "name",
      "titleLine",
      "contacts",
      "sectionTitle",
      "summary",
      "sectionTitle",
      "skill",
      "sectionTitle",
      "entry",
      "bullet",
      "bullet",
      "sectionTitle",
      "entry",
      "bullet",
      "sectionTitle",
      "credential",
    ]);
    expect(blocks[2]).toEqual({
      type: "contacts",
      text: "ada@example.com | +55 31 99999-0000 | Belo Horizonte, MG",
    });
    expect(blocks[7]).toEqual({
      type: "sectionTitle",
      kind: "experience",
      text: "Professional experience",
    });
    expect(blocks[8]).toEqual({
      type: "entry",
      ownerId: positionId,
      title: "Globex",
      subtitle: "Tech Lead (parallel project)",
      period: "Mar/2021 – Present",
      note: null,
    });
    expect(blocks[15]).toEqual({
      type: "credential",
      credentialId,
      text: "UFMG · Computer Science (BSc) Feb/2010 – Dec/2014",
    });
  });

  it("names sections and dates in the output language", () => {
    const blocks = contentToBlocks(resume, "pt-BR");
    expect(blocks[7]).toMatchObject({ text: "Experiência profissional" });
    expect(blocks[8]).toMatchObject({ period: "mar/2021 – atual" });
  });

  it("prints a letter: header, greeting, paragraphs, closing", () => {
    const blocks = contentToBlocks(letter, "en-US");
    expect(blocks.map((block) => block.type)).toEqual([
      "name",
      "titleLine",
      "contacts",
      "greeting",
      "paragraph",
      "paragraph",
      "closing",
    ]);
  });

  it("only lines the user writes are editable", () => {
    const editable = contentToBlocks(resume, "en-US")
      .filter(isEditableBlock)
      .map((block) => block.type);
    expect(editable).toEqual([
      "summary",
      "skill",
      "bullet",
      "bullet",
      "bullet",
    ]);
  });
});

describe("blocksToContent", () => {
  it("round-trips a resume and a letter unchanged", () => {
    expect(blocksToContent(resume, contentToBlocks(resume, "en-US"))).toEqual(
      resume
    );
    expect(blocksToContent(resume, contentToBlocks(resume, "pt-BR"))).toEqual(
      resume
    );
    expect(blocksToContent(letter, contentToBlocks(letter, "en-US"))).toEqual(
      letter
    );
  });

  it("writes an edited bullet, keeps its id and origin, and adds or removes lines", () => {
    const blocks = contentToBlocks(resume, "en-US").flatMap((block) => {
      if (block.type === "bullet" && block.lineId === "b1") {
        return [{ ...block, text: "Cut deploy time by 40% in a year." }];
      }
      if (block.type === "bullet" && block.lineId === "b2") {
        // A new bullet typed after it; b2 itself is removed.
        return [{ ...block, lineId: "new1", text: "Mentored juniors." }];
      }
      return [block];
    });
    const next = blocksToContent(resume, blocks);
    const section = next.sections.find((row) => row.kind === "experience");
    expect(section?.kind === "experience" && section.entries[0].lines).toEqual([
      {
        id: "b1",
        text: "Cut deploy time by 40% in a year.",
        origin: { kind: "evidence", evidenceIds: [evidenceId] },
      },
      { id: "new1", text: "Mentored juniors.", origin: { kind: "manual" } },
    ]);
    // Nothing else moved.
    expect({
      ...next,
      sections: next.sections.filter((s) => s.kind !== "experience"),
    }).toEqual({
      ...resume,
      sections: resume.sections.filter((s) => s.kind !== "experience"),
    });
  });

  it("writes the summary and a skill group's text, keeping the label", () => {
    const blocks = contentToBlocks(resume, "en-US").map((block) =>
      block.type === "summary"
        ? { ...block, text: "New summary." }
        : block.type === "skill"
          ? { ...block, label: "Tampered", text: "Kubernetes" }
          : block
    );
    const next = blocksToContent(resume, blocks);
    expect(next.sections[0]).toMatchObject({ line: { text: "New summary." } });
    expect(next.sections[1]).toMatchObject({
      groups: [{ label: "Core", text: "Kubernetes" }],
    });
  });

  it("ignores changes to locked blocks: header, titles, facts, credentials", () => {
    const blocks: DocumentBlock[] = contentToBlocks(resume, "en-US").map(
      (block): DocumentBlock => {
        switch (block.type) {
          case "name":
            return { ...block, text: "Mallory" };
          case "titleLine":
            return { ...block, text: "CEO" };
          case "sectionTitle":
            return { ...block, text: "Whatever" };
          case "entry":
            return { ...block, title: "Initech", period: "1999" };
          case "credential":
            return { ...block, text: "PhD" };
          default:
            return block;
        }
      }
    );
    expect(blocksToContent(resume, blocks)).toEqual(resume);
    // Dropping them changes nothing either.
    expect(
      blocksToContent(
        resume,
        blocks.filter((block) => isEditableBlock(block))
      )
    ).toEqual(resume);
  });

  it("keeps a letter's header while writing its greeting, paragraphs and closing", () => {
    const blocks = contentToBlocks(letter, "en-US").flatMap(
      (block): DocumentBlock[] => {
        switch (block.type) {
          case "name":
            return [{ ...block, text: "Mallory" }];
          case "greeting":
            return [{ ...block, text: "Hello," }];
          case "paragraph":
            return block.lineId === "l1"
              ? [block, { ...block, lineId: "l3", text: "A new paragraph." }]
              : [];
          case "closing":
            return [{ ...block, text: "Bye" }];
          default:
            return [block];
        }
      }
    );
    expect(blocksToContent(letter, blocks)).toEqual({
      ...letter,
      greeting: "Hello,",
      paragraphs: [
        letter.paragraphs[0],
        { id: "l3", text: "A new paragraph.", origin: { kind: "manual" } },
      ],
      closing: "Bye",
    });
  });
});

describe("linesById", () => {
  it("indexes every written line of a resume and a letter", () => {
    expect([...linesById(resume).keys()]).toEqual([
      "summary",
      "core",
      "b1",
      "b2",
      "p1",
    ]);
    expect([...linesById(letter).keys()]).toEqual(["l1", "l2"]);
  });
});
