import { describe, expect, it } from "vitest";

import type { ResumeContent } from "../schemas/resume-content";
import { fitToPages } from "./fit-to-pages";
import { renderResumePdf } from "./resume-pdf";

const P1 = "00000000-0000-4000-8000-000000000001";

const resume = (bullets: number): ResumeContent => ({
  kind: "resume",
  header: {
    name: "Ana Souza",
    titleLine: "Senior Platform Engineer | Kubernetes",
    contacts: ["ana@example.com"],
    city: "São Paulo",
  },
  sections: [
    {
      kind: "summary",
      line: { id: "s", text: "Platform engineer.", origin: { kind: "manual" } },
    },
    {
      kind: "experience",
      entries: [
        {
          positionId: P1,
          employer: "Globex",
          title: "Tech Lead",
          startDate: "2021-03",
          endDate: null,
          context: null,
          lines: Array.from({ length: bullets }, (_, index) => ({
            id: `b${index}`,
            text: `Cut deploy time by ${index}% with Kubernetes, moving every service to a managed cluster and writing the runbooks.`,
            origin: { kind: "manual" as const },
          })),
        },
      ],
    },
  ],
});

describe("rendering a resume PDF", () => {
  it("measures the real number of pages", async () => {
    const short = await renderResumePdf({
      content: resume(3),
      language: "en-US",
    });
    expect(short.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(short.pages).toBe(1);
    const long = await renderResumePdf({
      content: resume(90),
      language: "pt-BR",
    });
    expect(long.pages).toBeGreaterThan(2);
  });

  it("trims until the real PDF fits in two pages, older positions only", async () => {
    type Experience = Extract<
      ResumeContent["sections"][number],
      { kind: "experience" }
    >;
    const entryOf = (content: ResumeContent) =>
      (content.sections[1] as Experience).entries[0];
    const content = resume(30);
    const P2 = "00000000-0000-4000-8000-000000000002";
    const older = {
      ...entryOf(resume(60)),
      positionId: P2,
      employer: "Acme",
      startDate: "2015-01",
      endDate: "2020-12",
    };
    const twoPositions: ResumeContent = {
      ...content,
      sections: [
        content.sections[0],
        { kind: "experience", entries: [entryOf(content), older] },
      ],
    };
    expect(
      (await renderResumePdf({ content: twoPositions, language: "en-US" }))
        .pages
    ).toBeGreaterThan(2);
    const fitted = await fitToPages({
      content: twoPositions,
      language: "en-US",
      maxPages: 2,
      ages: new Map([[P2, "older"]]),
    });
    expect(fitted.fits).toBe(true);
    expect(fitted.pages).toBeLessThanOrEqual(2);
    const [recent, old] = (fitted.content.sections[1] as Experience).entries;
    expect(old.lines.length).toBeLessThan(60);
    // The bullets of a recent experience are never cut.
    expect(recent.lines).toHaveLength(30);
    // Trimming drops lines from the end; it never rewrites one.
    expect(old.lines.map((line) => line.id)).toEqual(
      Array.from({ length: old.lines.length }, (_, index) => `b${index}`)
    );
    expect(old.lines).toEqual(older.lines.slice(0, old.lines.length));
  });

  it("leaves a resume too long as it is when only recent experiences are left", async () => {
    const content = resume(90);
    const fitted = await fitToPages({
      content,
      language: "en-US",
      maxPages: 2,
      ages: new Map(),
    });
    // The user is warned instead.
    expect(fitted.fits).toBe(false);
    expect(fitted.pages).toBeGreaterThan(2);
    expect(fitted.content).toEqual(content);
  });
});
