import { describe, expect, it } from "vitest";

import { createSensitiveFilter } from "@repo/api/domains/evidence/sensitive/sensitive-filter";

import {
  type ResumeHeaderFields,
  defaultTemplateSections,
} from "../schemas/template";
import { resolveSections } from "../template/resolve-sections";
import { assembleResume, type ResumeDraft } from "./assemble-resume";
import { atsCheck } from "./ats-check";
import {
  applyLockedFactOverrides,
  type CareerContext,
} from "./load-career-context";
import {
  estimatePages,
  findForbiddenLines,
  lockedFactViolations,
  resumeText,
  trimToPages,
} from "./resume-checks";

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const E1 = "00000000-0000-4000-8000-0000000000e1";
const E2 = "00000000-0000-4000-8000-0000000000e2";
const E3 = "00000000-0000-4000-8000-0000000000e3";
const C1 = "00000000-0000-4000-8000-0000000000c1";
const I1 = "00000000-0000-4000-8000-0000000000a1";
const I2 = "00000000-0000-4000-8000-0000000000a2";

const context: CareerContext = {
  positions: [
    {
      id: P1,
      employer: "Globex",
      title: "Tech Lead",
      startDate: "2021-03",
      endDate: null,
    },
    {
      id: P2,
      employer: "Acme",
      title: "Developer",
      startDate: "2017-01",
      endDate: "2021-02",
    },
  ],
  evidence: [
    {
      id: E1,
      positionId: P1,
      credentialId: null,
      projectId: null,
      kind: "achievement",
      text: "Cut deploy time by 40% with Kubernetes",
    },
    {
      id: E2,
      positionId: P1,
      credentialId: null,
      projectId: null,
      kind: "responsibility",
      text: "Led a team of 5 engineers",
    },
    {
      id: E3,
      positionId: P2,
      credentialId: null,
      projectId: null,
      kind: "tool",
      text: "Built services in Node.js and PostgreSQL",
    },
  ],
  credentials: [
    {
      id: C1,
      kind: "language",
      title: "English",
      institution: null,
      level: "C1",
      startDate: null,
      endDate: null,
      inProgress: false,
    },
  ],
  skills: [{ id: "s1", name: "TypeScript", evidenceIds: [E3] }],
  projects: [],
  instructions: [
    {
      id: I1,
      positionId: P1,
      credentialId: null,
      text: "I led the Kubernetes migration in 2021",
    },
    {
      id: I2,
      positionId: null,
      credentialId: null,
      text: "Emphasize people management",
    },
  ],
};

const header: ResumeHeaderFields = {
  name: "Ana Souza",
  email: "ana@example.com",
  phone: "",
  linkedin: "linkedin.com/in/ana",
  github: "",
  city: "São Paulo",
};

const draft: ResumeDraft = {
  title_line: "Senior Platform Engineer | Kubernetes, Node.js",
  summary: {
    text: "Platform engineer who cut deploy time by 40%.",
    evidence_ids: [E1],
  },
  skills: [
    {
      label: "Core",
      items: ["TypeScript", "Kubernetes", "Rust"],
      evidence_ids: [E1],
    },
  ],
  experience: [
    {
      position_id: P1,
      context: null,
      bullets: [
        {
          text: "Cut deploy time by 40% by moving to Kubernetes.",
          evidence_ids: [E1],
        },
        { text: "Grew revenue by 300%.", evidence_ids: [E1] },
        { text: "Mentored engineers.", evidence_ids: [] },
        // Evidence of another position is not allowed here.
        { text: "Built Node.js services.", evidence_ids: [E3] },
      ],
    },
  ],
  projects: [],
};

const sections = resolveSections({
  template: defaultTemplateSections,
  language: "en-US",
  topics: [],
});

describe("assembling a resume", () => {
  it("takes locked facts from the positions and lists every position", () => {
    const { content } = assembleResume({ draft, context, sections, header });
    const experience = content.sections.find((s) => s.kind === "experience");
    expect(experience).toMatchObject({
      entries: [
        {
          employer: "Globex",
          title: "Tech Lead",
          startDate: "2021-03",
          endDate: null,
        },
        { employer: "Acme", title: "Developer", lines: [] },
      ],
    });
    expect(lockedFactViolations(content, context.positions)).toEqual([]);
  });

  it("drops lines without evidence, with unsupported figures or foreign evidence", () => {
    const { content, dropped } = assembleResume({
      draft,
      context,
      sections,
      header,
    });
    const experience = content.sections.find((s) => s.kind === "experience");
    expect(
      experience?.kind === "experience" &&
        experience.entries[0].lines.map((line) => line.text)
    ).toEqual(["Cut deploy time by 40% by moving to Kubernetes."]);
    expect(dropped).toEqual(
      expect.arrayContaining([
        { text: "Grew revenue by 300%.", reason: "unsupported_figure" },
        { text: "Mentored engineers.", reason: "no_evidence" },
        { text: "Built Node.js services.", reason: "no_evidence" },
      ])
    );
  });

  it("keeps only skills that are approved or spelled out in cited evidence", () => {
    const { content, dropped } = assembleResume({
      draft,
      context,
      sections,
      header,
    });
    const skills = content.sections.find((s) => s.kind === "skills");
    expect(skills?.kind === "skills" && skills.groups[0].text).toBe(
      "TypeScript, Kubernetes"
    );
    expect(dropped).toContainEqual({ text: "Rust", reason: "unknown_skill" });
  });

  it("fills credentials by code and builds the header from the template", () => {
    const { content } = assembleResume({ draft, context, sections, header });
    expect(content.header).toEqual({
      name: "Ana Souza",
      titleLine: "Senior Platform Engineer | Kubernetes, Node.js",
      contacts: ["ana@example.com", "linkedin.com/in/ana"],
      city: "São Paulo",
    });
    expect(content.sections.map((s) => s.kind)).toEqual([
      "summary",
      "skills",
      "experience",
      "languages",
    ]);
    expect(estimatePages(content)).toBeLessThan(1);
  });

  it("flags tampered locked facts and lines with forbidden terms", () => {
    const { content } = assembleResume({ draft, context, sections, header });
    const experience = content.sections.find((s) => s.kind === "experience");
    if (experience?.kind === "experience") experience.entries[0].title = "CTO";
    expect(lockedFactViolations(content, context.positions)).toEqual([P1]);

    const filter = createSensitiveFilter([
      { original: "Kubernetes", choice: "exclude" },
    ]);
    expect(findForbiddenLines(content, filter)).toContain("title_line");
  });
});

describe("application instructions and overrides", () => {
  const withBullets = (
    bullets: ResumeDraft["experience"][number]["bullets"]
  ): ResumeDraft => ({
    ...draft,
    skills: [],
    experience: [{ position_id: P1, context: null, bullets }],
  });
  const linesOf = (content: ReturnType<typeof assembleResume>["content"]) =>
    content.sections.flatMap((section) =>
      section.kind === "experience"
        ? section.entries.flatMap((entry) => entry.lines)
        : []
    );

  it("lets a line rest on an instruction and traces it there", () => {
    const { content, dropped } = assembleResume({
      draft: withBullets([
        { text: "Led the Kubernetes migration in 2021.", evidence_ids: [I1] },
        {
          text: "Led the migration that cut deploy time by 40%.",
          evidence_ids: [E1, I1],
        },
      ]),
      context,
      sections,
      header,
    });
    expect(dropped).toEqual([]);
    expect(linesOf(content).map((line) => line.origin)).toEqual([
      { kind: "instruction", instructionIds: [I1], evidenceIds: [] },
      { kind: "instruction", instructionIds: [I1], evidenceIds: [E1] },
    ]);
  });

  it("refuses an instruction about another position, or unsupported figures", () => {
    const other: CareerContext = {
      ...context,
      instructions: [{ ...context.instructions[0], positionId: P2 }],
    };
    const { content, dropped } = assembleResume({
      draft: withBullets([
        { text: "Led the Kubernetes migration.", evidence_ids: [I1] },
      ]),
      context: other,
      sections,
      header,
    });
    expect(linesOf(content)).toEqual([]);
    expect(dropped).toEqual([
      { text: "Led the Kubernetes migration.", reason: "no_evidence" },
    ]);

    const figures = assembleResume({
      draft: withBullets([
        { text: "Led 12 people in the migration.", evidence_ids: [I1] },
      ]),
      context,
      sections,
      header,
    });
    expect(figures.dropped).toEqual([
      { text: "Led 12 people in the migration.", reason: "unsupported_figure" },
    ]);
  });

  it("prints a confirmed override instead of the locked fact, and enforces it", () => {
    const positions = applyLockedFactOverrides(context.positions, [
      { positionId: P1, field: "title", value: "Engineering Manager" },
      { positionId: P2, field: "end_date", value: "2021-06" },
    ]);
    const { content } = assembleResume({
      draft,
      context: { ...context, positions },
      sections,
      header,
    });
    const experience = content.sections.find((s) => s.kind === "experience");
    expect(experience).toMatchObject({
      entries: [
        { positionId: P1, title: "Engineering Manager", employer: "Globex" },
        { positionId: P2, title: "Developer", endDate: "2021-06" },
      ],
    });
    expect(lockedFactViolations(content, positions)).toEqual([]);
    expect(lockedFactViolations(content, context.positions)).toEqual([P1, P2]);
  });
});

describe("trimming to two pages", () => {
  it("drops the oldest positions' last bullets first, rewriting nothing", () => {
    const { content } = assembleResume({ draft, context, sections, header });
    const experience = content.sections.find((s) => s.kind === "experience");
    if (experience?.kind !== "experience") throw new Error("no experience");
    const long = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `x${i}`,
        text: "A long bullet ".repeat(12),
        origin: { kind: "evidence" as const, evidenceIds: [E1] },
      }));
    experience.entries[0].lines = long(30);
    experience.entries[1].lines = long(30);
    expect(estimatePages(content)).toBeGreaterThan(2);
    const trimmed = trimToPages(content, 2);
    const entries = trimmed.sections.find(
      (s) => s.kind === "experience"
    )!.entries;
    expect(estimatePages(trimmed)).toBeLessThanOrEqual(2);
    expect(entries[0].lines.length).toBeGreaterThan(entries[1].lines.length);
    expect(entries[0].lines[0].text).toBe("A long bullet ".repeat(12));
  });

  it("keeps only technologies in the title line that the evidence backs", () => {
    const { content, dropped } = assembleResume({
      draft: { ...draft, title_line: "Platform Engineer | Kubernetes, Elixir" },
      context,
      sections,
      header,
    });
    expect(content.header.titleLine).toBe("Platform Engineer | Kubernetes");
    expect(dropped).toContainEqual({ text: "Elixir", reason: "unknown_skill" });
  });
});

describe("resolving template sections", () => {
  it("checks language and keyword conditions, and forced choices win", () => {
    const template = defaultTemplateSections.map((section) =>
      section.kind === "publications"
        ? { ...section, enabled: true, keywords: ["research"] }
        : section.kind === "courses"
          ? { ...section, enabled: true, languages: ["pt-BR" as const] }
          : section
    );
    expect(
      resolveSections({
        template,
        language: "en-US",
        topics: ["Research scientist"],
      })
    ).toContain("publications");
    expect(
      resolveSections({ template, language: "en-US", topics: ["Frontend"] })
    ).not.toContain("publications");
    expect(
      resolveSections({ template, language: "pt-BR", topics: [] })
    ).toContain("courses");
    expect(
      resolveSections({
        template,
        language: "en-US",
        topics: [],
        forcedIn: ["awards"],
        forcedOut: ["summary"],
      })
    ).toEqual(["skills", "experience", "education", "languages", "awards"]);
  });
});

describe("ATS check", () => {
  it("matches literally and splits misses by evidence", () => {
    const { content } = assembleResume({ draft, context, sections, header });
    expect(
      atsCheck({
        text: resumeText(content),
        keywords: [
          { term: "Kubernetes", backedByEvidence: true },
          { term: "PostgreSQL", backedByEvidence: true },
          { term: "Go", backedByEvidence: false },
          { term: "Node.js", backedByEvidence: true },
        ],
      })
    ).toEqual({
      matched: ["Kubernetes", "Node.js"],
      useOpeningTerm: ["PostgreSQL"],
      realGaps: ["Go"],
      total: 4,
    });
  });
});
