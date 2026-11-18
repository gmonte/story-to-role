import { describe, expect, it, vi } from "vitest";

import type { AiClient } from "@repo/api/domains/ai/ai-client";
import { communicationRulesFilter } from "@repo/api/domains/profile/rules/load-never-include-filter";

import type { ResumeContent } from "../schemas/resume-content";
import { repairOpeningTerms } from "./opening-terms";
import type { OpeningBrief } from "./resume-prompts";

const filter = communicationRulesFilter({ neverInclude: [], publicNames: [] });
const E1 = "00000000-0000-4000-8000-0000000000e1";
const E2 = "00000000-0000-4000-8000-0000000000e2";

const resume = (
  lines: Array<{ id: string; text: string; evidenceIds: string[] }>
): ResumeContent =>
  ({
    kind: "resume",
    header: { name: "Ada", titleLine: "", contacts: [], city: null },
    sections: [
      {
        kind: "experience",
        entries: [
          {
            positionId: "00000000-0000-4000-8000-000000000001",
            employer: "Acme",
            title: "Dev",
            startDate: "2020-01",
            endDate: null,
            context: null,
            lines: lines.map((line) => ({
              id: line.id,
              text: line.text,
              origin: { kind: "evidence", evidenceIds: line.evidenceIds },
            })),
          },
        ],
      },
    ],
  }) as unknown as ResumeContent;

const brief: OpeningBrief = {
  title: "Backend",
  company: null,
  terms: [
    { kind: "keyword", category: "tool", text: "PostgreSQL" },
    { kind: "keyword", category: "tool", text: "Kubernetes" },
  ],
  fitCheck: [
    { term: "PostgreSQL", verdict: "met", evidenceIds: [E1] },
    { term: "Kubernetes", verdict: "gap", evidenceIds: [] },
  ],
};

const aiAnswering = (items: Array<{ id: string; text: string }>) => {
  const generateObject = vi.fn(async () => ({
    object: { items },
    usage: { inputTokens: 1, outputTokens: 1 },
  }));
  return { ai: { generateObject } as unknown as AiClient, generateObject };
};

const texts = (content: ResumeContent) =>
  content.sections.flatMap((section) =>
    section.kind === "experience"
      ? section.entries.flatMap((entry) => entry.lines.map((line) => line.text))
      : []
  );

const run = (ai: AiClient, content: ResumeContent) =>
  repairOpeningTerms({
    ai,
    filter,
    content,
    brief,
    role: "writing",
    language: "English",
  });

describe("repairing the opening's terms", () => {
  it("rewrites the line citing the evidence of a backed keyword spelled differently", async () => {
    const { ai, generateObject } = aiAnswering([
      { id: "a", text: "Tuned PostgreSQL queries." },
    ]);
    const { content } = await run(
      ai,
      resume([
        { id: "a", text: "Tuned Postgres queries.", evidenceIds: [E1] },
        { id: "b", text: "Led a team.", evidenceIds: [E2] },
      ])
    );
    expect(texts(content)).toEqual([
      "Tuned PostgreSQL queries.",
      "Led a team.",
    ]);
    const call = generateObject.mock.calls[0] as unknown as [
      { messages: Array<{ content: string }> },
    ];
    expect(call[0].messages[0].content).not.toContain("Led a team");
  });

  it("never adds a real gap: no call, no change", async () => {
    const { ai, generateObject } = aiAnswering([
      { id: "a", text: "Ran Kubernetes." },
    ]);
    const original = resume([
      { id: "a", text: "Ran containers.", evidenceIds: [E2] },
      { id: "b", text: "Used PostgreSQL.", evidenceIds: [E1] },
    ]);
    const { content } = await run(ai, original);
    expect(texts(content)).toEqual(texts(original));
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("discards a rewrite that introduces a number", async () => {
    const { ai } = aiAnswering([
      { id: "a", text: "Tuned PostgreSQL queries by 40%." },
    ]);
    const original = resume([
      { id: "a", text: "Tuned Postgres queries.", evidenceIds: [E1] },
    ]);
    const { content } = await run(ai, original);
    expect(texts(content)).toEqual(texts(original));
  });
});
