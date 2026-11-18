import { describe, expect, it } from "vitest";

import {
  adjusterPrompt,
  editorPrompt,
  reviewerPrompt,
  strategistPrompt,
} from "../generation/resume-prompts";
import { linkedinPrompt } from "../linkedin/linkedin-prompts";
import { defaultGenerationSettings } from "../schemas/generation-settings";
import { bulletFormatRule, checkBulletShape } from "./bullet-format";

describe("checkBulletShape", () => {
  it("accepts well-shaped bullets in both languages", () => {
    expect(
      checkBulletShape(
        "Redesigned the billing service, cutting processing time by half, using Node.js and Postgres.",
        "en-US"
      )
    ).toEqual([]);
    expect(
      checkBulletShape(
        "Implementei a fila de notificações, reduzindo os atrasos, com Node.js e AWS SQS.",
        "pt-BR"
      )
    ).toEqual([]);
  });

  it("flags a bare list of technologies", () => {
    expect(
      checkBulletShape("React, Node.js, Postgres, AWS", "en-US")
    ).toContain("techList");
    expect(
      checkBulletShape("Tecnologias: React, Node.js, AWS", "pt-BR")
    ).toContain("techList");
  });

  it("flags a bullet over three lines", () => {
    expect(
      checkBulletShape(`Built ${"a very long thing ".repeat(25)}.`, "en-US")
    ).toContain("tooLong");
  });

  it("flags openings that aren't an action", () => {
    expect(
      checkBulletShape("Responsible for the billing service.", "en-US")
    ).toContain("opening");
    expect(
      checkBulletShape("Responsável por manter o serviço de cobrança.", "pt-BR")
    ).toContain("opening");
    expect(checkBulletShape("Development of the API.", "en-US")).toContain(
      "opening"
    );
    expect(
      checkBulletShape("Desenvolvimento da API de cobrança.", "pt-BR")
    ).toContain("opening");
  });
});

describe("prompts", () => {
  const settings = defaultGenerationSettings;
  const resume = { kind: "resume", header: {}, sections: [] } as never;
  it("carry the bullet format", () => {
    const prompts = [
      strategistPrompt("m", settings),
      reviewerPrompt({ material: "m", resume: "r", pages: 1, maxPages: 2 }),
      editorPrompt({
        material: "m",
        settings,
        draft: {} as never,
        advice: [],
        inconsistencies: [],
        dropped: [],
        forbiddenLines: [],
        pages: 1,
      }),
      adjusterPrompt({ material: "m", settings, reference: resume }),
      linkedinPrompt("m", settings),
    ];
    for (const prompt of prompts) expect(prompt).toContain(bulletFormatRule);
  });
});
