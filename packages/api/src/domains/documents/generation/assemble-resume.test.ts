import { describe, expect, it } from "vitest";

import { createSensitiveFilter } from "@repo/api/domains/evidence/sensitive/sensitive-filter";
import { parseBlocks } from "@repo/api/domains/profile/truth/blocks";
import {
  extractProfile,
  profilePassages,
} from "@repo/api/domains/profile/truth/extract";

import {
  defaultGenerationSettings,
  type ExperienceAge,
  experienceAge,
} from "../schemas/generation-settings";
import type { ResumeContent } from "../schemas/resume-content";
import {
  type ResumeHeaderFields,
  defaultTemplateSections,
} from "../schemas/template";
import { resolveSections } from "../template/resolve-sections";
import { relinkReference } from "./adjust-resume";
import { assembleResume, type ResumeDraft } from "./assemble-resume";
import { atsCheck } from "./ats-check";
import {
  applyLockedFactOverrides,
  type CareerContext,
} from "./load-career-context";
import { readProfileSource, stableId } from "./profile-source";
import {
  estimatePages,
  findForbiddenLines,
  lockedFactViolations,
  resumeText,
  trimToPages,
} from "./resume-checks";

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const P3 = "00000000-0000-4000-8000-000000000003";
const P4 = "00000000-0000-4000-8000-000000000004";
const E1 = "00000000-0000-4000-8000-0000000000e1";
const E2 = "00000000-0000-4000-8000-0000000000e2";
const E3 = "00000000-0000-4000-8000-0000000000e3";
const E4 = "00000000-0000-4000-8000-0000000000e4";
const C1 = "00000000-0000-4000-8000-0000000000c1";
const I1 = "00000000-0000-4000-8000-0000000000a1";
const I2 = "00000000-0000-4000-8000-0000000000a2";

// The profile's identity and contact: where the header comes from.
const header: ResumeHeaderFields = {
  name: "Ana Souza",
  email: "ana@example.com",
  phone: "",
  linkedin: "linkedin.com/in/ana",
  github: "",
  city: "São Paulo",
};

/** A profile line whose figures the profile marks measured. */
const line = (
  id: string,
  positionId: string,
  kind: CareerContext["evidence"][number]["kind"],
  text: string
) => ({
  id,
  positionId,
  credentialId: null,
  projectId: null,
  kind,
  text,
  figures: text,
});

const context: CareerContext = {
  profileVersionId: "00000000-0000-4000-8000-0000000000f1",
  header,
  positions: [
    {
      id: P1,
      employer: "Globex",
      title: "Tech Lead",
      startDate: "2021-03",
      endDate: null,
      notDone: [],
    },
    {
      id: P2,
      employer: "Acme",
      title: "Developer",
      startDate: "2017-01",
      endDate: "2021-02",
      notDone: [],
    },
  ],
  evidence: [
    line(E1, P1, "achievement", "Cut deploy time by 40% with Kubernetes"),
    line(E2, P1, "responsibility", "Led a team of 5 engineers"),
    line(E3, P2, "tool", "Built services in Node.js and PostgreSQL"),
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
  evidenceOfPassage: new Map(),
  rules: { neverInclude: [], neverClaim: [] },
};

const draft: ResumeDraft = {
  emphasis: [],
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
      relevance: null,
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

// The month "recent" is measured from: both positions above are recent.
const today = "2026-01";

/** Assembles the draft above, under the default settings, unless told. */
const assemble = (input: Partial<Parameters<typeof assembleResume>[0]> = {}) =>
  assembleResume({
    draft,
    context,
    sections,
    settings: defaultGenerationSettings,
    today,
    purposes: [],
    ...input,
  });

const experienceOf = (content: ResumeContent) => {
  const section = content.sections.find((s) => s.kind === "experience");
  return section?.kind === "experience" ? section.entries : [];
};

describe("assembling a resume", () => {
  it("lists a competency once, in the first group that names it", () => {
    const { content } = assemble({
      draft: {
        ...draft,
        skills: [
          {
            label: "Core",
            items: ["TypeScript", "Kubernetes"],
            evidence_ids: [E1],
          },
          { label: "Infra", items: ["kubernetes"], evidence_ids: [E1] },
          {
            label: "More",
            items: ["Kubernetes", "TypeScript"],
            evidence_ids: [E1],
          },
        ],
      },
    });
    const skills = content.sections.find((s) => s.kind === "skills");
    expect(
      skills?.kind === "skills" &&
        skills.groups.map((group) => [group.label, group.text])
    ).toEqual([["Core", "TypeScript, Kubernetes"]]);
  });

  it("keeps a position's context only as a note of a few words", () => {
    const contextOf = (context: string | null) =>
      experienceOf(
        assemble({
          draft: {
            ...draft,
            experience: [{ ...draft.experience[0], context }],
          },
        }).content
      )[0].context;
    expect(contextOf("Parallel project")).toBe("Parallel project");
    // Never a place for facts: nothing long, and no number.
    expect(
      contextOf("B2B payments platform; Python, FastAPI, PostgreSQL, Actions")
    ).toBeNull();
    expect(contextOf("Team of 8")).toBeNull();
    expect(contextOf("  ")).toBeNull();
  });

  it("takes locked facts from the positions and lists every position", () => {
    const { content } = assemble();
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
    const { content, dropped } = assemble();
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
    const { content, dropped } = assemble();
    const skills = content.sections.find((s) => s.kind === "skills");
    expect(skills?.kind === "skills" && skills.groups[0].text).toBe(
      "TypeScript, Kubernetes"
    );
    expect(dropped).toContainEqual({ text: "Rust", reason: "unknown_skill" });
  });

  it("fills credentials by code and builds the header from the profile", () => {
    const { content } = assemble();
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

    // The account's name is printed only when the profile gives none.
    expect(assemble({ fallbackName: "Ana S." }).content.header.name).toBe(
      "Ana Souza"
    );
    expect(
      assemble({
        context: { ...context, header: { ...header, name: " " } },
        fallbackName: "Ana S.",
      }).content.header.name
    ).toBe("Ana S.");
  });

  it("flags tampered locked facts and lines with forbidden terms", () => {
    const { content } = assemble();
    const experience = content.sections.find((s) => s.kind === "experience");
    if (experience?.kind === "experience") experience.entries[0].title = "CTO";
    expect(lockedFactViolations(content, context.positions)).toEqual([P1]);

    const filter = createSensitiveFilter([
      { original: "Kubernetes", choice: "exclude" },
    ]);
    expect(findForbiddenLines(content, filter)).toContain("title_line");
  });
});

describe("figures by the profile's marks", () => {
  const profile = `# Profile

## Professional identity

- Professional name: Ana Souza

## Experience (most recent first)

### Globex — Tech Lead (2021-03 to present)

- Tools: Kubernetes
- Results:
  - Cut deploy time by 40% with Kubernetes [measured: CI dashboard].
  - Cut cloud costs by 30% [estimated].
  - Brought on-call pages down 50% [to confirm].
`;
  const blocks = parseBlocks(profile);
  const source = readProfileSource({
    careerProfileId: "career",
    profile: {
      versionId: stableId("version"),
      number: 1,
      markdown: profile,
      extract: extractProfile(blocks),
      passages: profilePassages(blocks).map((passage, ordinal) => ({
        id: stableId("passage", `${ordinal}`),
        kind: passage.kind,
        section: passage.section,
        experience: passage.experience,
        text: passage.text,
      })),
    },
  });
  const marked: CareerContext = {
    ...source,
    evidence: source.evidence.map((row) => ({
      ...row,
      credentialId: null,
      projectId: null,
    })),
    projects: [],
    instructions: [],
  };
  const idOf = (text: string) =>
    marked.evidence.find((row) => row.text.includes(text))!.id;
  const assembled = assemble({
    context: marked,
    draft: {
      ...draft,
      title_line: "Platform Engineer | Kubernetes",
      summary: {
        text: "Tech lead who cut deploy time by 40% and cloud costs by 30%.",
        evidence_ids: [idOf("Cut deploy time"), idOf("Cut cloud costs")],
      },
      skills: [],
      experience: [
        {
          position_id: marked.positions[0].id,
          context: null,
          relevance: null,
          bullets: [
            {
              text: "Cut cloud costs by 30%.",
              evidence_ids: [idOf("Cut cloud costs")],
            },
            {
              text: "Brought on-call pages down 50%.",
              evidence_ids: [idOf("on-call pages")],
            },
            {
              text: "Cut deploy time by 40% with Kubernetes.",
              evidence_ids: [idOf("Cut deploy time")],
            },
            {
              text: "Cut cloud costs.",
              evidence_ids: [idOf("Cut cloud costs")],
            },
            {
              text: "Brought on-call pages down.",
              evidence_ids: [idOf("on-call pages")],
            },
          ],
        },
      ],
    },
  });

  it("hands a writer the lines without marks, unusable figures withheld", () => {
    expect(marked.evidence.map((row) => [row.text, row.figures])).toEqual([
      ["Tools: Kubernetes", ""],
      [
        "Results: Cut deploy time by 40% with Kubernetes.",
        "Cut deploy time by 40% with Kubernetes",
      ],
      ["Results: Cut cloud costs by [figure withheld].", ""],
      ["Results: Brought on-call pages down [figure withheld].", ""],
    ]);
  });

  it("drops an estimated or unconfirmed figure, and keeps the fact told without it", () => {
    expect(assembled.dropped).toEqual([
      // A measured figure doesn't back the estimated one next to it.
      {
        text: "Tech lead who cut deploy time by 40% and cloud costs by 30%.",
        reason: "unsupported_figure",
      },
      { text: "Cut cloud costs by 30%.", reason: "unsupported_figure" },
      { text: "Brought on-call pages down 50%.", reason: "unsupported_figure" },
    ]);
    expect(
      experienceOf(assembled.content)[0].lines.map((line) => line.text)
    ).toEqual([
      "Cut deploy time by 40% with Kubernetes.",
      "Cut cloud costs.",
      "Brought on-call pages down.",
    ]);
  });

  it("never prints a mark", () => {
    const printed = JSON.stringify(assembled.content);
    expect(printed).not.toMatch(
      /\[(measured|estimated|to confirm|no number|figure withheld)/i
    );
    expect(printed).not.toContain("CI dashboard");
    expect(printed).not.toMatch(/30%|50%/);
  });
});

describe("figures as whole numbers", () => {
  const measured: CareerContext = {
    ...context,
    evidence: [
      line(
        E1,
        P1,
        "achievement",
        "Cut build time from 15 minutes to 1,8 for 1,200 services in 2023"
      ),
    ],
  };
  const told = (texts: string[]) =>
    assemble({
      context: measured,
      settings: { ...defaultGenerationSettings, bulletsRecent: 8 },
      draft: {
        ...draft,
        title_line: "Platform Engineer",
        summary: null,
        skills: [],
        experience: [
          {
            position_id: P1,
            context: null,
            relevance: null,
            bullets: texts.map((text) => ({ text, evidence_ids: [E1] })),
          },
        ],
      },
    });

  it("accepts a figure the line shows, in either decimal notation", () => {
    const texts = [
      "Cut build time from 15 minutes to 1.8.",
      "Cut build time to 1,8 minutes.",
      "Sped up the builds of 1.200 services.",
      "Sped up 1,200 services in 2023, down from 15 minutes.",
    ];
    const { content, dropped } = told(texts);
    expect(dropped).toEqual([]);
    expect(experienceOf(content)[0].lines.map((row) => row.text)).toEqual(
      texts
    );
  });

  it("refuses a number that is only a part of one the line shows", () => {
    const texts = [
      // Of "15".
      "Led 5 engineers.",
      "Cut build time by 1 minute.",
      // Of "1,8" and of "1,200".
      "Cut build time to 8 minutes.",
      "Sped up 200 services.",
      // Of "2023".
      "Sped up the builds in 202 days.",
      "Cut build time by 15.5 minutes.",
    ];
    const { content, dropped } = told(texts);
    expect(experienceOf(content)[0].lines).toEqual([]);
    expect(dropped).toEqual(
      texts.map((text) => ({ text, reason: "unsupported_figure" }))
    );
  });
});

describe("the reference of an adjustment after the profile changed", () => {
  const entry = (
    positionId: string,
    employer: string,
    title: string,
    startDate: string | null
  ) => ({
    positionId,
    employer,
    title,
    startDate,
    endDate: null,
    context: null,
    lines: [
      {
        id: `line-${positionId}`,
        text: `Worked at ${employer}.`,
        origin: { kind: "evidence" as const, evidenceIds: [E1] },
      },
    ],
  });
  const referenceOf = (
    entries: Array<ReturnType<typeof entry>>
  ): ResumeContent => ({
    kind: "resume",
    header: { name: "Ana Souza", titleLine: "", contacts: [], city: null },
    sections: [{ kind: "experience", entries }],
  });
  const position = (
    id: string,
    employer: string,
    title: string,
    startDate: string | null
  ) => ({ id, employer, title, startDate });
  const relinked = (
    entries: Array<ReturnType<typeof entry>>,
    positions: Array<ReturnType<typeof position>>
  ) =>
    experienceOf(relinkReference(referenceOf(entries), positions)).map(
      (row) => row.positionId
    );
  const old = "00000000-0000-4000-8000-00000000000a";
  const older = "00000000-0000-4000-8000-00000000000b";

  it("finds a position again by its start and its employer or its title", () => {
    const reference = [entry(old, "Globex", "Tech Lead", "2021-03")];
    // The title was corrected, or the employer was.
    expect(
      relinked(reference, [position(P1, "Globex", "Technical Lead", "2021-03")])
    ).toEqual([P1]);
    expect(
      relinked(reference, [position(P1, "Globex Inc.", "Tech Lead", "2021-03")])
    ).toEqual([P1]);
    // Another start, or both changed: it is not the same position.
    expect(
      relinked(reference, [position(P1, "Globex", "Technical Lead", "2021-04")])
    ).toEqual([old]);
    expect(
      relinked(reference, [position(P1, "Initech", "CTO", "2021-03")])
    ).toEqual([old]);
  });

  it("leaves known positions alone and gives each position to one entry", () => {
    const reference = [
      entry(P1, "Globex", "Tech Lead", "2021-03"),
      entry(old, "Globex", "Developer", "2021-03"),
      entry(older, "Globex", "Intern", "2021-03"),
    ];
    const positions = [
      position(P1, "Globex", "Tech Lead", "2021-03"),
      position(P2, "Globex", "Software Developer", "2021-03"),
    ];
    // P1 is taken by the entry that already has it; P2 by the first match.
    expect(relinked(reference, positions)).toEqual([P1, P2, older]);
    // Only the position changes: bullets and printed facts stay.
    const [, moved] = experienceOf(
      relinkReference(referenceOf(reference), positions)
    );
    expect(moved).toEqual({ ...reference[1], positionId: P2 });
  });
});

describe("generation settings", () => {
  // To January 2026: P1 is current, P2 ended 7 years ago, P3 exactly 15.
  const career: CareerContext = {
    ...context,
    positions: [
      context.positions[0],
      { ...context.positions[1], startDate: "2014-01", endDate: "2018-06" },
      {
        id: P3,
        employer: "Initech",
        title: "Programmer",
        startDate: "2006-01",
        endDate: "2011-01",
        notDone: [],
      },
    ],
    evidence: [
      ...context.evidence,
      line(E4, P3, "tool", "Wrote the billing batch jobs in Cobol"),
    ],
  };
  const bullets = (count: number, evidenceId: string, label: string) =>
    Array.from({ length: count }, (_, index) => ({
      text: `${label} bullet ${"abcdefgh"[index]}.`,
      evidence_ids: [evidenceId],
    }));
  const written = (relevance: string | null): ResumeDraft => ({
    ...draft,
    experience: [
      {
        position_id: P1,
        context: null,
        relevance: null,
        bullets: bullets(5, E2, "Globex"),
      },
      {
        position_id: P2,
        context: null,
        relevance: null,
        bullets: bullets(3, E3, "Acme"),
      },
      {
        position_id: P3,
        context: null,
        relevance,
        bullets: bullets(2, E4, "Initech"),
      },
    ],
  });
  const purposes = ["Kubernetes", "Batch processing in Cobol"];
  const linesByEmployer = (content: ResumeContent) =>
    Object.fromEntries(
      experienceOf(content).map((entry) => [
        entry.employer,
        entry.lines.map((line) => line.text),
      ])
    );

  it("tells an experience's age by when it ended", () => {
    const age = (endDate: string | null) =>
      experienceAge({ endDate }, defaultGenerationSettings, today);
    expect(age(null)).toBe("recent");
    expect(age("2021-01")).toBe("recent");
    expect(age("2020-12")).toBe("older");
    expect(age("2011-02")).toBe("older");
    expect(age("2011-01")).toBe("very_old");
  });

  it("keeps 3 bullets of a recent experience and 1 of an older one, the first ones", () => {
    const { content, dropped } = assemble({
      context: career,
      draft: written(null),
      purposes,
    });
    expect(linesByEmployer(content)).toEqual({
      Globex: ["Globex bullet a.", "Globex bullet b.", "Globex bullet c."],
      Acme: ["Acme bullet a."],
    });
    // The very old one named no requirement of this document.
    expect(dropped).toContainEqual({
      text: "Programmer, Initech",
      reason: "not_relevant",
    });
  });

  it("lets a very old experience in only for a purpose, with one bullet", () => {
    const { content, dropped } = assemble({
      context: career,
      draft: written("batch processing in COBOL"),
      purposes,
    });
    const [, , initech] = experienceOf(content);
    expect(initech).toMatchObject({
      positionId: P3,
      employer: "Initech",
      // As the document's purpose writes it.
      relevance: "Batch processing in Cobol",
      lines: [{ text: "Initech bullet a." }],
    });
    expect(dropped.filter((row) => row.reason === "not_relevant")).toEqual([]);
    // The others carry no relevance.
    expect(experienceOf(content)[0].relevance).toBeUndefined();

    // A relevance that is none of the document's purposes doesn't count.
    const other = assemble({
      context: career,
      draft: written("Mainframes"),
      purposes,
    });
    expect(Object.keys(linesByEmployer(other.content))).toEqual([
      "Globex",
      "Acme",
    ]);
    // Nor does a matching one whose bullet rests on nothing.
    const unproven = written("Kubernetes");
    unproven.experience[2].bullets = [
      { text: "Ran Kubernetes.", evidence_ids: [E1] },
    ];
    expect(
      Object.keys(
        linesByEmployer(
          assemble({ context: career, draft: unproven, purposes }).content
        )
      )
    ).toEqual(["Globex", "Acme"]);
  });

  it("leaves a very old experience out, or keeps it like an older one, as set", () => {
    const leftOut = assemble({
      context: career,
      draft: written("Batch processing in Cobol"),
      purposes,
      settings: { ...defaultGenerationSettings, veryOld: "leave_out" },
    });
    expect(Object.keys(linesByEmployer(leftOut.content))).toEqual([
      "Globex",
      "Acme",
    ]);

    const kept = assemble({
      context: career,
      draft: written(null),
      purposes,
      settings: {
        ...defaultGenerationSettings,
        veryOld: "keep",
        bulletsRecent: 4,
        bulletsOlder: 2,
      },
    });
    expect(linesByEmployer(kept.content)).toEqual({
      Globex: [
        "Globex bullet a.",
        "Globex bullet b.",
        "Globex bullet c.",
        "Globex bullet d.",
      ],
      Acme: ["Acme bullet a.", "Acme bullet b."],
      Initech: ["Initech bullet a.", "Initech bullet b."],
    });
    expect(experienceOf(kept.content)[2].relevance).toBeUndefined();
    expect(kept.dropped.filter((row) => row.reason === "not_relevant")).toEqual(
      []
    );
  });
});

describe("application instructions and overrides", () => {
  const withBullets = (
    bullets: ResumeDraft["experience"][number]["bullets"]
  ): ResumeDraft => ({
    ...draft,
    skills: [],
    experience: [{ position_id: P1, context: null, relevance: null, bullets }],
  });
  const linesOf = (content: ReturnType<typeof assembleResume>["content"]) =>
    content.sections.flatMap((section) =>
      section.kind === "experience"
        ? section.entries.flatMap((entry) => entry.lines)
        : []
    );

  it("lets a line rest on an instruction and traces it there", () => {
    const { content, dropped } = assemble({
      draft: withBullets([
        { text: "Led the Kubernetes migration in 2021.", evidence_ids: [I1] },
        {
          text: "Led the migration that cut deploy time by 40%.",
          evidence_ids: [E1, I1],
        },
      ]),
    });
    expect(dropped).toEqual([]);
    expect(linesOf(content).map((line) => line.origin)).toEqual([
      { kind: "instruction", instructionIds: [I1], evidenceIds: [] },
      { kind: "instruction", instructionIds: [I1], evidenceIds: [E1] },
    ]);
  });

  it("traces a skill spelled out only in an instruction to it", () => {
    const { content, dropped } = assemble({
      draft: {
        ...draft,
        skills: [
          {
            label: "Platform",
            items: ["TypeScript", "Kubernetes migration"],
            evidence_ids: [I1],
          },
        ],
      },
    });
    expect(dropped.filter((row) => row.reason === "unknown_skill")).toEqual([]);
    const skills = content.sections.find((s) => s.kind === "skills");
    expect(skills).toMatchObject({
      groups: [
        {
          text: "TypeScript, Kubernetes migration",
          origin: {
            kind: "instruction",
            instructionIds: [I1],
            evidenceIds: [E3],
          },
        },
      ],
    });
  });

  it("refuses an instruction about another position, or unsupported figures", () => {
    const other: CareerContext = {
      ...context,
      instructions: [{ ...context.instructions[0], positionId: P2 }],
    };
    const { content, dropped } = assemble({
      draft: withBullets([
        { text: "Led the Kubernetes migration.", evidence_ids: [I1] },
      ]),
      context: other,
    });
    expect(linesOf(content)).toEqual([]);
    expect(dropped).toEqual([
      { text: "Led the Kubernetes migration.", reason: "no_evidence" },
    ]);

    const figures = assemble({
      draft: withBullets([
        { text: "Led 12 people in the migration.", evidence_ids: [I1] },
      ]),
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
    const { content } = assemble({ context: { ...context, positions } });
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

describe("trimming to the page limit", () => {
  // Long enough that each cut shows in the estimate: one cut per step.
  const long = (id: string) => ({
    id,
    text: "A long bullet ".repeat(41).trim(),
    origin: { kind: "evidence" as const, evidenceIds: [E1] },
  });
  const sentence = (n: number) => `Sentence ${n} ${"goes on ".repeat(40)}end.`;
  const entry = (
    positionId: string,
    employer: string,
    endDate: string | null,
    lines: number
  ) => ({
    positionId,
    employer,
    title: "Developer",
    startDate: "2000-01",
    endDate,
    context: null,
    lines: Array.from({ length: lines }, (_, index) =>
      long(`${employer}-${index}`)
    ),
  });
  const content: ResumeContent = {
    kind: "resume",
    header: { name: "Ana Souza", titleLine: "", contacts: [], city: null },
    sections: [
      {
        kind: "summary",
        line: {
          id: "s",
          text: [1, 2, 3, 4, 5].map(sentence).join(" "),
          origin: { kind: "evidence", evidenceIds: [E1] },
        },
      },
      {
        kind: "skills",
        groups: [
          {
            id: "k1",
            label: "Core",
            text: "Kubernetes, Terraform",
            origin: { kind: "skill", evidenceIds: [] },
          },
          {
            id: "k2",
            label: "Other",
            text: "Go, Python, Bash",
            origin: { kind: "skill", evidenceIds: [] },
          },
        ],
      },
      {
        kind: "experience",
        entries: [
          entry(P1, "Globex", null, 4),
          entry(P2, "Acme", "2018-06", 2),
          entry(P4, "Hooli", "2014-06", 2),
          { ...entry(P3, "Initech", "2009-12", 1), relevance: "Cobol" },
        ],
      },
    ],
  };
  const ages = new Map<string, ExperienceAge>([
    [P2, "older"],
    [P4, "older"],
    [P3, "very_old"],
  ]);
  const stateOf = (resume: ResumeContent) => {
    const summary = resume.sections.find((s) => s.kind === "summary");
    const skills = resume.sections.find((s) => s.kind === "skills");
    return {
      bullets: Object.fromEntries(
        experienceOf(resume).map((row) => [row.employer, row.lines.length])
      ),
      sentences:
        summary?.kind === "summary"
          ? summary.line.text.match(/Sentence \d/g)
          : null,
      skills:
        skills?.kind === "skills"
          ? skills.groups.map((group) => group.text)
          : null,
    };
  };

  it("shortens in the settings' order, never the bullets of recent experiences", () => {
    // Each step asks for a little less than the resume has now.
    const states = [stateOf(content)];
    let current = content;
    for (;;) {
      const next = trimToPages(current, estimatePages(current) - 0.05, ages);
      if (next === current) break;
      states.push(stateOf(next));
      current = next;
    }
    const all = ["Sentence 1", "Sentence 2", "Sentence 3"];
    const five = [...all, "Sentence 4", "Sentence 5"];
    const skills = ["Kubernetes, Terraform", "Go, Python, Bash"];
    expect(states).toEqual([
      {
        bullets: { Globex: 4, Acme: 2, Hooli: 2, Initech: 1 },
        sentences: five,
        skills,
      },
      // The very old experience that entered for relevance leaves whole.
      { bullets: { Globex: 4, Acme: 2, Hooli: 2 }, sentences: five, skills },
      // Then the bullets of older experiences, oldest first.
      { bullets: { Globex: 4, Acme: 2, Hooli: 1 }, sentences: five, skills },
      { bullets: { Globex: 4, Acme: 2, Hooli: 0 }, sentences: five, skills },
      { bullets: { Globex: 4, Acme: 1, Hooli: 0 }, sentences: five, skills },
      { bullets: { Globex: 4, Acme: 0, Hooli: 0 }, sentences: five, skills },
      // Then the summary, down to three sentences.
      { bullets: { Globex: 4, Acme: 0, Hooli: 0 }, sentences: all, skills },
      // Then the competencies listed last, down to three.
      {
        bullets: { Globex: 4, Acme: 0, Hooli: 0 },
        sentences: all,
        skills: ["Kubernetes, Terraform", "Go"],
      },
    ]);
    // Nothing is rewritten, and a recent experience keeps every bullet.
    expect(experienceOf(current)[0].lines).toEqual(
      experienceOf(content)[0].lines
    );
    // What still doesn't fit is returned as it is.
    expect(trimToPages(content, 0, ages)).toEqual(current);
    expect(estimatePages(current)).toBeGreaterThan(0);
  });

  it("cuts nothing from a resume that fits", () => {
    expect(trimToPages(content, estimatePages(content), ages)).toBe(content);
  });

  it("keeps only technologies in the title line that the evidence backs", () => {
    const { content: assembled, dropped } = assemble({
      draft: { ...draft, title_line: "Platform Engineer | Kubernetes, Elixir" },
    });
    expect(assembled.header.titleLine).toBe("Platform Engineer | Kubernetes");
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
    const { content } = assemble();
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
