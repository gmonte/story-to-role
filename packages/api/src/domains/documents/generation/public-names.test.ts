import { describe, expect, it, vi } from "vitest";

import type { AiClient } from "@repo/api/domains/ai/ai-client";
import { communicationRulesFilter } from "@repo/api/domains/profile/rules/load-never-include-filter";

import type { ResumeContent } from "../schemas/resume-content";
import { repairPublicNames } from "./public-names";

const filter = communicationRulesFilter({
  neverInclude: ["dados bancários", "Initrode"],
  publicNames: [
    { original: "Projeto Fênix", public: "plataforma de pagamentos" },
  ],
});

const resume = (lines: Array<{ id: string; text: string }>): ResumeContent => ({
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
          lines: lines
            .map((line) => ({
              ...line,
              origin: { kind: "manual" },
            }))
            .map((line, index) =>
              index === 0 || line.id !== "m"
                ? { ...line, origin: { kind: "profile", evidenceIds: [] } }
                : line
            ),
        },
      ],
    },
  ] as ResumeContent["sections"],
});

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

describe("repairing public names", () => {
  it("rewrites only the lines still carrying an original, with the sentence adjusted", async () => {
    const { ai, generateObject } = aiAnswering([
      { id: "a", text: "Liderei a plataforma de pagamentos." },
    ]);
    const { content } = await repairPublicNames({
      ai,
      filter,
      content: resume([
        { id: "a", text: "Liderei o Projeto Fênix." },
        { id: "b", text: "Reduzi o custo." },
      ]),
      role: "writing",
      language: "Brazilian Portuguese",
    });
    expect(texts(content)).toEqual([
      "Liderei a plataforma de pagamentos.",
      "Reduzi o custo.",
    ]);
    expect(generateObject).toHaveBeenCalledTimes(1);
    const call = generateObject.mock.calls[0] as unknown as [
      { messages: Array<{ content: string }> },
    ];
    expect(call[0].messages[0].content).not.toContain("Reduzi");
  });

  it("keeps the line, never substituting blindly, when the rewrite still has the original or a new figure", async () => {
    const original = resume([
      { id: "a", text: "Liderei o Projeto Fênix." },
      { id: "b", text: "Entreguei o projeto fenix em 3 meses." },
    ]);
    const { ai } = aiAnswering([
      { id: "a", text: "Liderei o Projeto Fênix de novo." },
      { id: "b", text: "Entreguei a plataforma em 4 meses." },
    ]);
    const { content } = await repairPublicNames({
      ai,
      filter,
      content: original,
      role: "writing",
      language: "Brazilian Portuguese",
    });
    expect(texts(content)).toEqual(texts(original));
    expect(filter.mentionedPublicNames(texts(content).join(" "))).toHaveLength(
      1
    );
  });

  it("makes no call when no line carries an original", async () => {
    const { ai, generateObject } = aiAnswering([]);
    await repairPublicNames({
      ai,
      filter,
      content: resume([{ id: "a", text: "Tratei dados bancários." }]),
      role: "writing",
      language: "Brazilian Portuguese",
    });
    expect(generateObject).not.toHaveBeenCalled();
  });
});
