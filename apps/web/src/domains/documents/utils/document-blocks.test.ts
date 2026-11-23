import { describe, expect, it } from "vitest";

import type { CoverLetterContent } from "@repo/api/domains/documents/schemas/cover-letter-content";
import type { LinkedinContent } from "@repo/api/domains/documents/schemas/linkedin-content";
import type { ResumeContent } from "@repo/api/domains/documents/schemas/resume-content";

import {
  blocksToContent,
  contentToBlocks,
  isEditableBlock,
  isRemovableBlock,
  linesById,
  moveSectionBlocks,
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
          startDate: "2024-01",
          endDate: null,
          role: "Founder",
          link: "https://side.example.com",
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
  it("prints a resume as the PDF does: header, sections, each position's facts", () => {
    const blocks = contentToBlocks(resume, "en-US");
    expect(blocks.map((block) => block.type)).toEqual([
      "name",
      "titleLine",
      "contacts",
      "city",
      "sectionTitle",
      "summary",
      "sectionTitle",
      "skill",
      "sectionTitle",
      "entryPeriod",
      "entry",
      "entryTitle",
      "entryContext",
      "bullet",
      "bullet",
      "sectionTitle",
      "entryPeriod",
      "entry",
      "entryTitle",
      "entryLink",
      "bullet",
      "sectionTitle",
      "credential",
    ]);
    expect(blocks[2]).toEqual({
      type: "contacts",
      text: "ada@example.com | +55 31 99999-0000",
    });
    expect(blocks[3]).toEqual({ type: "city", text: "Belo Horizonte, MG" });
    expect(blocks[8]).toEqual({
      type: "sectionTitle",
      kind: "experience",
      text: "Professional experience",
    });
    expect(blocks.slice(9, 13)).toEqual([
      { type: "entryPeriod", ownerId: positionId, text: "Mar/2021 – Present" },
      { type: "entry", ownerId: positionId, text: "Globex" },
      { type: "entryTitle", ownerId: positionId, text: "Tech Lead" },
      { type: "entryContext", ownerId: positionId, text: "parallel project" },
    ]);
    // A project reads like a position: its period, name and link.
    expect(blocks.slice(16, 20)).toEqual([
      { type: "entryPeriod", ownerId: projectId, text: "Jan/2024 – Present" },
      { type: "entry", ownerId: projectId, text: "Side project" },
      { type: "entryTitle", ownerId: projectId, text: "Founder" },
      {
        type: "entryLink",
        ownerId: projectId,
        text: "https://side.example.com",
      },
    ]);
    expect(blocks[22]).toEqual({
      type: "credential",
      credentialId,
      text: "UFMG · Computer Science (BSc) Feb/2010 – Dec/2014",
    });
  });

  it("names sections and dates in the output language", () => {
    const blocks = contentToBlocks(resume, "pt-BR");
    expect(blocks[8]).toMatchObject({ text: "Experiência profissional" });
    expect(blocks[9]).toMatchObject({ text: "mar/2021 – atual" });
  });

  it("prints a letter: header, greeting, paragraphs, closing", () => {
    const blocks = contentToBlocks(letter, "en-US");
    expect(blocks.map((block) => block.type)).toEqual([
      "name",
      "titleLine",
      "contacts",
      "city",
      "greeting",
      "paragraph",
      "paragraph",
      "closing",
    ]);
  });

  it("everything is editable but the section titles and the credentials", () => {
    const locked = contentToBlocks(resume, "en-US")
      .filter((block) => !isEditableBlock(block))
      .map((block) => block.type);
    expect(locked).toEqual([
      "sectionTitle",
      "sectionTitle",
      "sectionTitle",
      "sectionTitle",
      "sectionTitle",
      "credential",
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

  it("removes a skill group whose line the user deleted", () => {
    const blocks = contentToBlocks(resume, "en-US").filter(
      (block) => block.type !== "skill"
    );
    const next = blocksToContent(resume, blocks);
    expect(next.sections[1]).toMatchObject({ kind: "skills", groups: [] });
  });

  it("lets Backspace remove an emptied bullet, paragraph or skill group, never a fact", () => {
    expect(
      (["bullet", "paragraph", "skill"] as const).every(isRemovableBlock)
    ).toBe(true);
    expect(
      (["summary", "entry", "sectionTitle", "name"] as const).some(
        isRemovableBlock
      )
    ).toBe(false);
  });

  it("writes the header and a position's facts both ways, as the user typed them", () => {
    const blocks: DocumentBlock[] = contentToBlocks(resume, "en-US").map(
      (block): DocumentBlock => {
        switch (block.type) {
          case "name":
            return { ...block, text: "Ada King" };
          case "titleLine":
            return { ...block, text: "Staff Engineer | Kubernetes" };
          case "contacts":
            return { ...block, text: "ada@example.org | linkedin.com/in/ada" };
          case "city":
            return { ...block, text: "São Paulo, SP" };
          case "entry":
            return block.ownerId === positionId
              ? { ...block, text: "Globex Corporation" }
              : { ...block, text: "Side project, renamed" };
          case "entryTitle":
            return block.ownerId === positionId
              ? { ...block, text: "Staff Engineer" }
              : { ...block, text: "Co-founder" };
          case "entryContext":
            return { ...block, text: "platform team" };
          case "entryPeriod":
            return block.ownerId === positionId
              ? { ...block, text: "Jan/2020 – Dec/2023" }
              : { ...block, text: "Feb/2024 – Jun/2025" };
          case "entryLink":
            return { ...block, text: "https://side.example.org" };
          default:
            return block;
        }
      }
    );
    const next = blocksToContent(resume, blocks);
    expect(next.header).toEqual({
      name: "Ada King",
      titleLine: "Staff Engineer | Kubernetes",
      contacts: ["ada@example.org", "linkedin.com/in/ada"],
      city: "São Paulo, SP",
    });
    const experience = next.sections.find((row) => row.kind === "experience");
    expect(
      experience?.kind === "experience" && experience.entries[0]
    ).toMatchObject({
      employer: "Globex Corporation",
      title: "Staff Engineer",
      context: "platform team",
      startDate: "2020-01",
      endDate: "2023-12",
      lines:
        resume.sections[2].kind === "experience" &&
        resume.sections[2].entries[0].lines,
    });
    const projects = next.sections.find((row) => row.kind === "projects");
    expect(projects?.kind === "projects" && projects.entries[0]).toMatchObject({
      name: "Side project, renamed",
      role: "Co-founder",
      startDate: "2024-02",
      endDate: "2025-06",
      link: "https://side.example.org",
    });
    // Printed again, the blocks read as typed: the round trip holds.
    expect(contentToBlocks(next, "en-US")).toEqual(blocks);
  });

  it("keeps the dates when the typed period doesn't read as one, and reads the output language's", () => {
    const typed = (text: string) =>
      blocksToContent(
        resume,
        contentToBlocks(resume, "pt-BR").map((block) =>
          block.type === "entryPeriod" ? { ...block, text } : block
        )
      ).sections.find((row) => row.kind === "experience");
    const dates = (section: ReturnType<typeof typed>) =>
      section?.kind === "experience" && {
        startDate: section.entries[0].startDate,
        endDate: section.entries[0].endDate,
      };
    expect(dates(typed("mar/2021 – atual"))).toEqual({
      startDate: "2021-03",
      endDate: null,
    });
    expect(dates(typed("2019-06 – 2021-02"))).toEqual({
      startDate: "2019-06",
      endDate: "2021-02",
    });
    expect(dates(typed("whenever"))).toEqual({
      startDate: "2021-03",
      endDate: null,
    });
  });

  it("ignores changes to locked blocks: section titles and credentials", () => {
    const blocks: DocumentBlock[] = contentToBlocks(resume, "en-US").map(
      (block): DocumentBlock => {
        switch (block.type) {
          case "sectionTitle":
            return { ...block, text: "Whatever" };
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

  it("writes a letter's header, greeting, paragraphs and closing", () => {
    const blocks = contentToBlocks(letter, "en-US").flatMap(
      (block): DocumentBlock[] => {
        switch (block.type) {
          case "name":
            return [{ ...block, text: "Ada King" }];
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
      header: { ...letter.header, name: "Ada King" },
      greeting: "Hello,",
      paragraphs: [
        letter.paragraphs[0],
        { id: "l3", text: "A new paragraph.", origin: { kind: "manual" } },
      ],
      closing: "Bye",
    });
  });
});

describe("moving a section", () => {
  const kinds = (content: ResumeContent) =>
    content.sections.map((section) => section.kind);

  it("moves a section with its content and the content follows the order", () => {
    const blocks = contentToBlocks(resume, "en-US");
    const before = kinds(resume);
    const projects = before.indexOf("projects");
    const experience = before.indexOf("experience");
    const moved = moveSectionBlocks(blocks, "projects", experience)!;
    const content = blocksToContent(resume, moved);
    const expected = [...before];
    expected.splice(projects, 1);
    expected.splice(experience, 0, "projects");
    expect(kinds(content)).toEqual(expected);
    // Nothing else changed: the sections only changed places.
    expect(
      content.sections.find((section) => section.kind === "projects")
    ).toEqual(resume.sections.find((section) => section.kind === "projects"));
    expect(content.header).toEqual(resume.header);
  });

  it("keeps the order the document has when nothing moves", () => {
    const blocks = contentToBlocks(resume, "en-US");
    expect(kinds(blocksToContent(resume, blocks))).toEqual(kinds(resume));
    expect(moveSectionBlocks(blocks, "summary", 0)).toBeNull();
    expect(moveSectionBlocks(blocks, "awards", 0)).toBeNull();
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

describe("LinkedIn text as blocks", () => {
  const traced = { kind: "evidence" as const, evidenceIds: [evidenceId] };
  const credential = {
    institution: null,
    level: null,
    startDate: null,
    endDate: null,
    inProgress: false,
  };
  const linkedin: LinkedinContent = {
    kind: "linkedin",
    headline: { id: "h1", text: "Tech Lead | Platform", origin: traced },
    headlineOptions: [
      { id: "h1", text: "Tech Lead | Platform", origin: traced },
      { id: "h2", text: "Platform engineer", origin: traced },
    ],
    about: {
      id: "about",
      text: "I lead platform teams.\n\nI like Kubernetes.",
      origin: traced,
    },
    experiences: [
      {
        positionId,
        employer: "Globex",
        title: "Tech Lead",
        startDate: "2021-03",
        endDate: null,
        lines: [{ id: "b1", text: "Cut deploy time by 40%.", origin: traced }],
      },
    ],
    projects: [],
    education: [
      {
        ...credential,
        credentialId,
        title: "BSc in Computer Science",
        institution: "State University",
        description: null,
      },
    ],
    certifications: [],
    languages: [
      {
        ...credential,
        credentialId: projectId,
        title: "English",
        level: "C1",
        proficiency: "full_professional",
      },
    ],
  };

  it("shows LinkedIn's sections in its order, with its facts and credentials locked", () => {
    const blocks = contentToBlocks(linkedin, "en-US");
    expect(
      blocks
        .filter((block) => block.type === "sectionTitle")
        .map((block) => block.text)
    ).toEqual(["Headline", "About", "Experience", "Education", "Languages"]);
    expect(blocks).toContainEqual({
      type: "headline",
      lineId: "h1",
      text: "Tech Lead | Platform",
    });
    // The About's paragraphs are blocks of their own.
    expect(
      blocks.filter((block) => block.type === "paragraph").map((b) => b.text)
    ).toEqual(["I lead platform teams.", "I like Kubernetes."]);
    const employer = blocks.find((block) => block.type === "entry")!;
    expect(isEditableBlock(employer)).toBe(false);
    expect(blocks).toContainEqual({
      type: "credential",
      credentialId: projectId,
      text: "English — Full professional proficiency",
    });
    // An education without a description gets an empty one to write in.
    const description = blocks.find((block) => block.type === "description");
    expect(description).toMatchObject({ ownerId: credentialId, text: "" });
    expect(isEditableBlock(description!)).toBe(true);
  });

  it("writes the edited blocks back: About joined, empty description and headline left out", () => {
    const blocks = contentToBlocks(linkedin, "en-US").map(
      (block): DocumentBlock => {
        if (block.type === "headline") return { ...block, text: "" };
        if (block.type === "paragraph" && block.text === "I like Kubernetes.")
          return { ...block, text: "I love Kubernetes." };
        if (block.type === "description")
          return { ...block, text: "Thesis on distributed systems." };
        // A locked fact typed over keeps the profile's.
        if (block.type === "entry") return { ...block, text: "Initech" };
        return block;
      }
    );
    const next = blocksToContent(linkedin, blocks);
    expect(next.headline).toBeNull();
    expect(next.headlineOptions).toEqual(linkedin.headlineOptions);
    expect(next.about).toEqual({
      ...linkedin.about,
      text: "I lead platform teams.\n\nI love Kubernetes.",
    });
    expect(next.experiences[0].employer).toBe("Globex");
    expect(next.education[0].description).toMatchObject({
      text: "Thesis on distributed systems.",
      origin: { kind: "manual" },
    });
    expect(next.languages).toEqual(linkedin.languages);
    expect([...linesById(next).keys()]).toEqual(
      expect.arrayContaining(["about", "b1"])
    );
  });
});
