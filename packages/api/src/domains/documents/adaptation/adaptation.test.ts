import { describe, expect, it } from "vitest";

import { lockedFactViolations } from "../generation/resume-checks";
import type { ResumeContent } from "../schemas/resume-content";
import { adaptContent, type AdaptationDraft } from "./adapt-content";
import { mergeSync, syncChanges } from "./three-way-merge";

const P1 = "00000000-0000-4000-8000-000000000001";
const E1 = "00000000-0000-4000-8000-0000000000e1";
const E2 = "00000000-0000-4000-8000-0000000000e2";

const evidence = (...ids: string[]) => ({
  kind: "evidence" as const,
  evidenceIds: ids,
});

const english: ResumeContent = {
  kind: "resume",
  header: {
    name: "Ana Souza",
    titleLine: "Senior Systems Analyst | Kubernetes",
    contacts: ["ana@example.com"],
    city: "São Paulo",
  },
  sections: [
    {
      kind: "summary",
      line: {
        id: "s1",
        text: "Analyst who cut costs by 1.5M.",
        origin: evidence(E1),
      },
    },
    {
      kind: "skills",
      groups: [
        {
          id: "k1",
          label: "Platform",
          text: "Kubernetes",
          origin: { kind: "skill", evidenceIds: [E1] },
        },
      ],
    },
    {
      kind: "experience",
      entries: [
        {
          positionId: P1,
          employer: "Globex",
          title: "Analista de Sistemas Sênior",
          startDate: "2021-03",
          endDate: null,
          context: null,
          lines: [
            { id: "b1", text: "Cut deploy time by 40%.", origin: evidence(E1) },
            {
              id: "b2",
              text: "Led a team of 5 engineers.",
              origin: evidence(E2),
            },
          ],
        },
      ],
    },
  ],
};

const draft: AdaptationDraft = {
  title_line: "Analista de Sistemas Sênior | Kubernetes",
  items: [
    { id: "s1", text: "Analista que reduziu custos em 1,5M.", label: null },
    { id: "k1", text: "Kubernetes", label: "Plataforma" },
    { id: "b1", text: "Reduziu o tempo de deploy em 40%.", label: null },
    // Converted figure: refused, the source wording stays.
    { id: "b2", text: "Liderou uma equipe de 6 engenheiros.", label: null },
  ],
  contexts: [],
  title_equivalents: [{ position_id: P1, title: "Senior Systems Analyst" }],
};

const linesOf = (content: ResumeContent) =>
  content.sections.flatMap((section) =>
    section.kind === "summary"
      ? [section.line]
      : section.kind === "skills"
        ? section.groups
        : section.kind === "experience"
          ? section.entries.flatMap((entry) => entry.lines)
          : []
  );

describe("adapting a version into another language", () => {
  it("rewrites wording only: same lines, same evidence, no new figures", () => {
    const { content, refused } = adaptContent({
      source: english,
      draft,
      titles: new Map(),
    });
    expect(refused).toEqual(["b2"]);
    expect(
      linesOf(content).map((line) => [line.id, line.text, line.origin])
    ).toEqual([
      ["s1", "Analista que reduziu custos em 1,5M.", evidence(E1)],
      ["k1", "Kubernetes", { kind: "skill", evidenceIds: [E1] }],
      ["b1", "Reduziu o tempo de deploy em 40%.", evidence(E1)],
      ["b2", "Led a team of 5 engineers.", evidence(E2)],
    ]);
    const skills = content.sections.find((s) => s.kind === "skills");
    expect(skills).toMatchObject({ groups: [{ label: "Plataforma" }] });
    expect(content.header.titleLine).toBe(
      "Analista de Sistemas Sênior | Kubernetes"
    );
  });

  it("prints the title chosen for the language and keeps other locked facts", () => {
    const { content } = adaptContent({
      source: english,
      draft,
      titles: new Map([[P1, "Senior Systems Analyst"]]),
    });
    const experience = content.sections.find((s) => s.kind === "experience");
    expect(experience).toMatchObject({
      entries: [
        {
          employer: "Globex",
          title: "Senior Systems Analyst",
          startDate: "2021-03",
          endDate: null,
        },
      ],
    });
    const positions = [
      {
        id: P1,
        employer: "Globex",
        title: "Analista de Sistemas Sênior",
        startDate: "2021-03",
        endDate: null,
      },
    ];
    expect(lockedFactViolations(content, positions)).toEqual([P1]);
    expect(
      lockedFactViolations(
        content,
        positions,
        new Map([[P1, ["Senior Systems Analyst"]]])
      )
    ).toEqual([]);
  });
});

describe("language sync", () => {
  const edit = (
    content: ResumeContent,
    lineId: string,
    text: string | null
  ): ResumeContent => ({
    ...content,
    sections: content.sections.map((section) =>
      section.kind === "experience"
        ? {
            ...section,
            entries: section.entries.map((entry) => ({
              ...entry,
              lines: entry.lines.flatMap((line) =>
                line.id !== lineId
                  ? [line]
                  : text === null
                    ? []
                    : [{ ...line, text }]
              ),
            })),
          }
        : section
    ),
  });
  const add = (
    content: ResumeContent,
    afterId: string,
    id: string,
    text: string
  ) => ({
    ...content,
    sections: content.sections.map((section) =>
      section.kind === "experience"
        ? {
            ...section,
            entries: section.entries.map((entry) => ({
              ...entry,
              lines: entry.lines.flatMap((line) =>
                line.id === afterId
                  ? [line, { id, text, origin: { kind: "manual" as const } }]
                  : [line]
              ),
            })),
          }
        : section
    ),
  });

  const portuguese = adaptContent({
    source: english,
    draft,
    titles: new Map(),
  }).content;

  it("lists the source's changes, flagging passages both sides changed", () => {
    let source = edit(english, "b1", "Cut deploy time by 40% in 2022.");
    source = edit(source, "b2", null);
    source = add(source, "b1", "n1", "Mentored 3 interns.");
    const target = edit(portuguese, "b2", "Liderou 5 engenheiros.");

    const changes = syncChanges({
      base: english,
      source,
      targetBase: portuguese,
      target,
    });
    expect(
      changes.map((c) => [c.lineId, c.kind, c.after, c.targetText, c.conflict])
    ).toEqual([
      [
        "b1",
        "changed",
        "Cut deploy time by 40% in 2022.",
        "Reduziu o tempo de deploy em 40%.",
        false,
      ],
      ["n1", "added", "Mentored 3 interns.", null, false],
      ["b2", "removed", null, "Liderou 5 engenheiros.", true],
    ]);
  });

  it("merges the selected changes, keeping the target's own edits", () => {
    let source = edit(english, "b1", "Cut deploy time by 40% in 2022.");
    source = add(source, "b1", "n1", "Mentored 3 interns.");
    source = edit(source, "b2", null);
    const target = edit(portuguese, "b2", "Liderou 5 engenheiros.");
    const changes = syncChanges({
      base: english,
      source,
      targetBase: portuguese,
      target,
    });

    const merged = mergeSync({
      source,
      target,
      // The conflict on b2 is resolved by keeping the target's line.
      changes: changes.filter((change) => change.lineId !== "b2"),
      adapted: new Map([
        ["b1", "Reduziu o tempo de deploy em 40% em 2022."],
        ["n1", "Orientou 3 estagiários."],
      ]),
    });
    expect(
      linesOf(merged).map((line) => [line.id, line.text, line.origin.kind])
    ).toEqual([
      ["s1", "Analista que reduziu custos em 1,5M.", "evidence"],
      ["k1", "Kubernetes", "skill"],
      ["b1", "Reduziu o tempo de deploy em 40% em 2022.", "evidence"],
      ["n1", "Orientou 3 estagiários.", "manual"],
      ["b2", "Liderou 5 engenheiros.", "evidence"],
    ]);
  });
});
