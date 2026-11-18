import { describe, expect, it } from "vitest";

import type { CareerContext } from "../generation/load-career-context";
import { withheld } from "../generation/profile-source";
import { defaultGenerationSettings } from "../schemas/generation-settings";
import type { ExperienceEntry, ResumeContent } from "../schemas/resume-content";
import { checkDocument, type CoverageFinding } from "./check-document";

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const P3 = "00000000-0000-4000-8000-000000000003";
const E1 = "00000000-0000-4000-8000-0000000000e1";
const E2 = "00000000-0000-4000-8000-0000000000e2";
const E3 = "00000000-0000-4000-8000-0000000000e3";
const E5 = "00000000-0000-4000-8000-0000000000e5";
const E4 = "00000000-0000-4000-8000-0000000000e4";
const I1 = "00000000-0000-4000-8000-0000000000a1";
// A profile line of another version: this one has no such passage.
const E9 = "00000000-0000-4000-8000-0000000000e9";

const today = "2026-11";

const line = (
  id: string,
  positionId: string,
  kind: CareerContext["evidence"][number]["kind"],
  text: string,
  figures = text
) => ({
  id,
  positionId,
  credentialId: null,
  projectId: null,
  kind,
  text,
  figures,
});

/** The frozen profile the checks read: two positions, one very old. */
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
  acceptedTitles: new Map([[P1, ["Tech Lead", "Líder Técnica"]]]),
  positions: [
    {
      id: P1,
      employer: "Globex",
      title: "Tech Lead",
      startDate: "2021-03",
      endDate: null,
      notDone: ["Did not run Terraform in production."],
    },
    {
      id: P2,
      employer: "Acme",
      title: "Developer",
      startDate: "2017-01",
      endDate: "2020-12",
      notDone: [],
    },
    {
      id: P3,
      employer: "Initech",
      title: "Intern",
      startDate: "2005-01",
      endDate: "2006-12",
      notDone: [],
    },
  ],
  evidence: [
    // The result's figure is measured; the estimated one was withheld.
    line(
      E1,
      P1,
      "achievement",
      `Cut deploy time by 40%. Cut costs by ${withheld}.`,
      "Cut deploy time by 40%. Cut costs by ."
    ),
    line(E2, P1, "tool", "Tools: Kubernetes"),
    line(E3, P2, "responsibility", "Built services in Node.js."),
    line(E5, P2, "tool", "Tools: Node.js, Terraform"),
    line(E4, P3, "responsibility", "Wrote COBOL batch jobs."),
  ],
  credentials: [],
  skills: [
    { id: "s1", name: "Kubernetes", evidenceIds: [] },
    { id: "s2", name: "Terraform", evidenceIds: [] },
  ],
  projects: [],
  instructions: [
    { id: I1, positionId: P1, credentialId: null, text: "Led a team of 5." },
  ],
  evidenceOfPassage: new Map(),
  profileLanguage: null,
  translations: [],
  acceptedEmployers: new Map(),
  translatedTitles: new Map(),
  rules: {
    neverInclude: ["Hooli"],
    neverClaim: ["fluent English"],
    publicNames: [],
  },
  studied: ["Rust"],
  gaps: [],
  careerDirection: [],
};

const entry = (
  positionId: string,
  lines: Array<{ id: string; text: string }>,
  extra: Partial<ExperienceEntry> = {}
): ExperienceEntry => {
  const position = context.positions.find((row) => row.id === positionId)!;
  return {
    positionId,
    employer: position.employer,
    title: position.title,
    startDate: position.startDate,
    endDate: position.endDate,
    context: null,
    lines: lines.map((row) => ({
      ...row,
      origin: { kind: "evidence", evidenceIds: [E1] },
    })),
    ...extra,
  };
};

const resume = (
  entries: ExperienceEntry[],
  summary = "Engineer."
): ResumeContent => ({
  kind: "resume",
  header: {
    name: "Ana",
    titleLine: "Tech Lead | Kubernetes",
    contacts: [],
    city: null,
  },
  sections: [
    {
      kind: "summary",
      line: {
        id: "sum",
        text: summary,
        origin: { kind: "evidence", evidenceIds: [E1] },
      },
    },
    { kind: "experience", entries },
  ],
});

const check = (
  content: ResumeContent,
  purposes: Array<{ text: string }> = [],
  withContext: typeof context = context
) =>
  checkDocument({
    content,
    context: withContext,
    settings: defaultGenerationSettings,
    today,
    purposes: purposes.map((purpose) => ({ ...purpose, evidenceIds: null })),
  });

const codes = (findings: CoverageFinding[]) =>
  findings.map((finding) => finding.code);

describe("the coverage review's code checks", () => {
  it("points out a line that doesn't trace to the frozen profile version", () => {
    const content = resume([
      entry(P1, [
        { id: "typed", text: "Mentored two interns." },
        { id: "gone", text: "Wrote the on-call runbook." },
        { id: "told", text: "Ran the migration." },
      ]),
      entry(P2, [{ id: "reworded", text: "Built the services, in Node.js." }]),
    ]);
    const entries = (content.sections[1] as { entries: ExperienceEntry[] })
      .entries;
    const lines = entries[0].lines;
    lines[0].origin = { kind: "manual" };
    // Reworded by the person: keeps the passage it came from.
    entries[1].lines[0].origin = {
      kind: "edited",
      evidenceIds: [E1],
      instructionIds: [],
      companyFactIds: [],
      motivationPointIds: [],
    };
    // Cites a passage this version doesn't hold.
    lines[1].origin = { kind: "evidence", evidenceIds: [E9] };
    // Rests on an instruction: the person's own words, kept.
    lines[2].origin = {
      kind: "instruction",
      instructionIds: [I1],
      evidenceIds: [],
    };
    expect(check(content)).toMatchObject([
      { code: "notInProfile", lineId: "typed", text: "Mentored two interns." },
      { code: "notInProfile", lineId: "gone" },
    ]);
    expect(
      check(content).filter((finding) => finding.lineId === "reworded")
    ).toEqual([]);
  });

  it("passes a resume that rests on the profile within its settings", () => {
    const content = resume([
      entry(P1, [
        { id: "l1", text: "Cut deploy time by 40% with Kubernetes." },
      ]),
      entry(P2, [{ id: "l2", text: "Built services in Node.js." }]),
    ]);
    expect(check(content)).toEqual([]);
  });

  it("finds a locked fact that differs, accepting an approved title equivalent", () => {
    const content = resume([
      entry(P1, [], { title: "Líder Técnica" }),
      entry(P2, [], { employer: "ACME Corp" }),
    ]);
    expect(check(content)).toEqual([
      {
        code: "lockedFact",
        lineId: null,
        positionId: P2,
        text: "Developer, ACME Corp",
        params: {
          employer: "Acme",
          title: "Developer",
          startDate: "2017-01",
          endDate: "2020-12",
        },
      },
    ]);
  });

  it("finds an entry for a position the frozen version doesn't have", () => {
    const unknown = "00000000-0000-4000-8000-000000000099";
    const content = resume([
      {
        ...entry(P1, []),
        positionId: unknown,
        employer: "Nowhere",
        title: "CTO",
      },
    ]);
    expect(check(content)).toMatchObject([
      {
        code: "lockedFact",
        positionId: unknown,
        text: "CTO, Nowhere",
        params: {},
      },
    ]);
  });

  it("counts bullets per the settings and the experience's age", () => {
    const bullets = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `b${index}`,
        text: "Built services in Node.js.",
      }));
    const content = resume([
      entry(P1, [
        ...bullets(3),
        { id: "x", text: "Cut deploy time by 40% with Kubernetes." },
      ]),
      entry(P2, bullets(3)),
    ]);
    expect(check(content)).toMatchObject([
      {
        code: "bulletCount",
        positionId: P1,
        params: { count: 4, limit: 3, age: "recent" },
      },
      {
        code: "bulletCount",
        positionId: P2,
        params: { count: 3, limit: 2, age: "older" },
      },
    ]);
  });

  it("keeps a very old experience only with the requirement that justified it", () => {
    const old = (relevance: string | null) =>
      entry(P3, [{ id: "o", text: "Wrote COBOL batch jobs." }], { relevance });
    expect(
      codes(check(resume([old(null)]), [{ text: "COBOL batch" }]))
    ).toEqual(["veryOld"]);
    expect(
      check(resume([old("COBOL batch")]), [{ text: "COBOL batch" }])
    ).toEqual([]);
    // Two bullets are one too many for it.
    expect(
      codes(
        check(
          resume([
            entry(
              P3,
              [
                { id: "o1", text: "Wrote COBOL batch jobs." },
                { id: "o2", text: "Wrote COBOL batch jobs." },
              ],
              { relevance: "COBOL batch" }
            ),
          ]),
          [{ text: "COBOL batch" }]
        )
      )
    ).toEqual(["bulletCount"]);
    // Left out by the settings: it never enters.
    expect(
      codes(
        checkDocument({
          content: resume([old("COBOL batch")]),
          context,
          settings: { ...defaultGenerationSettings, veryOld: "leave_out" },
          today,
          purposes: [{ text: "COBOL batch", evidenceIds: null }],
        })
      )
    ).toEqual(["veryOld"]);
    // Kept like an older one: one bullet, no relevance needed.
    expect(
      checkDocument({
        content: resume([old(null)]),
        context,
        settings: { ...defaultGenerationSettings, veryOld: "keep" },
        today,
        purposes: [],
      })
    ).toEqual([]);
  });

  it("finds a document over its pages, measured when a PDF exists", () => {
    const content = resume([entry(P1, [])]);
    expect(
      checkDocument({
        content,
        context,
        settings: defaultGenerationSettings,
        today,
        purposes: [],
        pages: 3,
      })
    ).toMatchObject([{ code: "pages", params: { pages: 3, maxPages: 2 } }]);
  });

  it("finds a figure the profile doesn't mark measured, wherever it is written", () => {
    const content: ResumeContent = {
      ...resume(
        [
          entry(
            P1,
            [
              { id: "ok", text: "Cut deploy time by 40%." },
              // The user's own edit: the estimated figure the profile withheld.
              { id: "bad", text: "Cut costs by 30%." },
            ],
            { context: "team of 12" }
          ),
          // Another position's measured figure backs nothing here.
          entry(P2, [{ id: "p2", text: "Cut deploy time by 40%." }]),
        ],
        // The summary may use any position's measured figure.
        "Cut deploy time by 40% and led 5."
      ),
    };
    content.header.titleLine = "Tech Lead | 3 clouds";
    expect(check(content)).toMatchObject([
      { code: "figure", lineId: "title_line", params: { figures: "3" } },
      {
        code: "figure",
        lineId: `context:${P1}`,
        positionId: P1,
        params: { figures: "12" },
      },
      {
        code: "figure",
        lineId: "bad",
        positionId: P1,
        text: "Cut costs by 30%.",
        params: { figures: "30%" },
      },
      {
        code: "figure",
        lineId: "p2",
        positionId: P2,
        params: { figures: "40%" },
      },
    ]);
  });

  it("lets a line name its position's years, a locked fact", () => {
    const content = resume([
      entry(P1, [
        { id: "y", text: "Running Kubernetes at Globex since 2021." },
      ]),
    ]);
    expect(check(content)).toEqual([]);
  });

  it("blocks on pages only once the PDF is measured", () => {
    const long = resume([
      entry(
        P1,
        Array.from({ length: 3 }, (_, index) => ({
          id: `l${index}`,
          text: "Cut deploy time by 40%.",
        }))
      ),
    ]);
    const pages = (measured: number | null) =>
      checkDocument({
        content: long,
        context,
        settings: { ...defaultGenerationSettings, resumeMaxPages: 1 },
        today,
        purposes: [],
        pages: measured,
      }).filter((finding) => finding.code === "pages");
    // An estimate is too rough to block: the editor warns on it instead.
    expect(pages(null)).toEqual([]);
    expect(pages(2)).toMatchObject([
      { code: "pages", params: { pages: 2, maxPages: 1 } },
    ]);
  });

  it("lets the opening's title carry its own numbers on the title line", () => {
    const titled = (titleLine: string) => {
      const base = resume([]);
      return { ...base, header: { ...base.header, titleLine } };
    };
    const findings = (titleLine: string, targetTitle: string | null) =>
      checkDocument({
        content: titled(titleLine),
        context,
        settings: defaultGenerationSettings,
        today,
        purposes: [],
        targetTitle,
      }).filter((finding) => finding.lineId === "title_line");
    expect(findings("Engineer 3 | Kubernetes", "Engineer 3")).toEqual([]);
    // Without the opening's title behind it, the number is a finding.
    expect(codes(findings("Engineer 3 | Kubernetes", null))).toEqual([
      "figure",
    ]);
  });

  it("finds a placeholder or a figure mark left in a line", () => {
    const content = resume([
      entry(P1, [
        { id: "w", text: `Cut costs by ${withheld}.` },
        { id: "m", text: "Cut costs by 30% [estimated]." },
      ]),
    ]);
    expect(check(content)).toMatchObject([
      { code: "figure", lineId: "w", params: { figures: withheld } },
      { code: "figure", lineId: "m", params: { figures: "[estimated], 30%" } },
    ]);
  });

  it("finds the communication rules' terms and a studied competency", () => {
    const content = resume([
      entry(P1, [
        { id: "h", text: "Migrated Hooli's platform." },
        { id: "e", text: "Fluent English speaker." },
        { id: "r", text: "Prototyped services in Rust." },
      ]),
    ]);
    expect(check(content)).toMatchObject([
      { code: "neverInclude", lineId: "h", params: { term: "Hooli" } },
      { code: "neverClaim", lineId: "e", params: { term: "fluent English" } },
      { code: "studied", lineId: "r", params: { name: "Rust" } },
    ]);
  });

  it("warns about an original name the public names dictionary covers, and never flags a category", () => {
    const named = {
      ...context,
      rules: {
        neverInclude: ["dados bancários"],
        neverClaim: [],
        publicNames: [
          { original: "Projeto Fênix", public: "a payments platform" },
        ],
      },
    };
    const content = resume([
      entry(P1, [
        {
          id: "f",
          text: "Built the projeto fenix backend with dados bancários.",
        },
      ]),
    ]);
    const findings = check(content, [], named);
    expect(findings).toMatchObject([
      {
        code: "publicName",
        lineId: "f",
        params: { term: "Projeto Fênix", publicName: "a payments platform" },
      },
    ]);
  });

  it("points out a code-printed field left in the profile's language, in both directions", () => {
    // A Portuguese profile in an English document: the dictionary printed
    // the employer; the title, the degree and the city were left as written.
    const portuguese: typeof context = {
      ...context,
      profileLanguage: "pt-BR",
      translations: [
        { original: "Meta IT (agora Insi)", translation: "Meta IT (now Insi)" },
      ],
      positions: [
        {
          ...context.positions[0],
          employer: "Meta IT (now Insi)",
          title: "Engenheira de Software Sênior",
        },
        ...context.positions.slice(1),
      ],
      acceptedTitles: new Map(),
    };
    const content: ResumeContent = {
      ...resume([
        {
          ...entry(P1, [], { employer: "Meta IT (now Insi)" }),
          title: "Engenheira de Software Sênior",
        },
        entry(P2, []),
      ]),
      header: {
        name: "Ana",
        titleLine: "",
        contacts: [],
        city: "Belo Horizonte, MG, Brasil",
      },
    };
    content.sections.push({
      kind: "education",
      entries: [
        {
          credentialId: E9,
          title: "Bacharelado em Sistemas de Informação",
          institution: "UFMG",
          level: null,
          startDate: null,
          endDate: null,
          inProgress: false,
        },
      ],
    });
    const findings = checkDocument({
      content,
      context: portuguese,
      settings: defaultGenerationSettings,
      today,
      purposes: [],
      language: "en-US",
    }).filter((finding) => finding.code === "untranslated");
    expect(findings).toEqual([
      {
        code: "untranslated",
        lineId: null,
        positionId: null,
        text: "Belo Horizonte, MG, Brasil",
        params: { field: "city" },
      },
      {
        code: "untranslated",
        lineId: null,
        positionId: P1,
        text: "Engenheira de Software Sênior",
        params: { field: "title" },
      },
      {
        code: "untranslated",
        lineId: null,
        positionId: null,
        text: "Bacharelado em Sistemas de Informação",
        params: { field: "credential", credentialId: E9 },
      },
    ]);
    // In the profile's own language nothing is pointed out.
    expect(
      checkDocument({
        content,
        context: portuguese,
        settings: defaultGenerationSettings,
        today,
        purposes: [],
        language: "pt-BR",
      }).filter((finding) => finding.code === "untranslated")
    ).toEqual([]);

    // An English profile in a Portuguese document.
    const english: typeof context = {
      ...context,
      profileLanguage: "en-US",
      positions: [
        { ...context.positions[0], employer: "Globex (now Initech)" },
        ...context.positions.slice(1),
      ],
    };
    const translatedByUser = checkDocument({
      content: resume([
        {
          ...entry(P1, [], { employer: "Globex (now Initech)" }),
          title: "Líder Técnica",
        },
      ]),
      context: english,
      settings: defaultGenerationSettings,
      today,
      purposes: [],
      language: "pt-BR",
    }).filter((finding) => finding.code === "untranslated");
    expect(translatedByUser).toMatchObject([
      { text: "Globex (now Initech)", params: { field: "employer" } },
    ]);
  });

  it("finds a known name claimed where the position says it was not done", () => {
    const content = resume([
      entry(P1, [{ id: "t", text: "Ran Terraform in production." }]),
    ]);
    expect(check(content)).toMatchObject([
      {
        code: "notDone",
        lineId: "t",
        positionId: P1,
        params: {
          name: "Terraform",
          notDone: "Did not run Terraform in production.",
        },
      },
    ]);
  });

  it("lets a name pass that the position's own lines use", () => {
    // Globex lists Terraform among its tools and says it never ran it in
    // production: naming Terraform there is no claim to block.
    const used: CareerContext = {
      ...context,
      evidence: [
        ...context.evidence,
        line(E2, P1, "tool", "Tools: Kubernetes, Terraform"),
      ],
    };
    const content = resume([
      entry(P1, [{ id: "t", text: "Wrote Terraform modules." }]),
    ]);
    expect(
      checkDocument({
        content,
        context: used,
        settings: defaultGenerationSettings,
        today,
        purposes: [],
      }).map((finding) => finding.code)
    ).toEqual([]);
  });

  it("lets a tool merely named in another position's not-done line pass", () => {
    // Terraform was not done at Globex; Acme's bullet may still name it.
    const content = resume([
      entry(P2, [{ id: "t", text: "Provisioned with Terraform." }]),
    ]);
    expect(check(content)).toEqual([]);
  });

  it("checks not-done lines by the names the profile knows, never free text", () => {
    const named: CareerContext = {
      ...context,
      positions: context.positions.map((position) =>
        position.id === P1
          ? { ...position, notDone: ["Did not do production support."] }
          : position
      ),
    };
    const content = resume([
      entry(P1, [{ id: "s", text: "Handled production support rotations." }]),
    ]);
    expect(
      checkDocument({
        content,
        context: named,
        settings: defaultGenerationSettings,
        today,
        purposes: [],
      })
    ).toEqual([]);
  });

  it("warns, never blocks, on a bullet off the bullet format", () => {
    const content = resume([
      entry(P2, [{ id: "r", text: "Responsible for the services." }]),
    ]);
    const findings = check(content);
    expect(findings).toEqual([
      expect.objectContaining({
        code: "bulletShape",
        lineId: "r",
        params: { problems: "opening" },
      }),
    ]);
  });
});
