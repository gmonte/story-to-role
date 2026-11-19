import { extractText } from "unpdf";
import { describe, expect, it } from "vitest";

import { resumeText } from "../generation/resume-checks";
import type { ResumeContent } from "../schemas/resume-content";
import { fitToPages } from "./fit-to-pages";
import { renderResumeFitted, renderResumePdf } from "./resume-pdf";

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
  it("prints a project with its period, role and link", async () => {
    const content: ResumeContent = {
      ...resume(1),
      sections: [
        ...resume(1).sections,
        {
          kind: "projects",
          entries: [
            {
              projectId: "00000000-0000-4000-8000-0000000000aa",
              name: "Side Product",
              startDate: "2024-01",
              endDate: null,
              role: "Founder",
              link: "https://side.example.com",
              lines: [
                { id: "p1", text: "Built it.", origin: { kind: "manual" } },
              ],
            },
          ],
        },
      ],
    };
    const { bytes, pages } = await renderResumePdf({
      content,
      language: "en-US",
    });
    expect(pages).toBe(1);
    const printed = await extractText(new Uint8Array(bytes), {
      mergePages: true,
    });
    expect(printed.text).toContain("PROJECTS");
    expect(printed.text).toContain("Side Product");
    expect(printed.text).toContain("Founder");
    expect(printed.text).toContain("Jan/2024 – Present");
    expect(printed.text).toContain("https://side.example.com");
  });

  it("prints sections in the order the content has them, projects first when moved", async () => {
    const withProjects: ResumeContent = {
      ...resume(1),
      sections: [
        ...resume(1).sections,
        {
          kind: "projects",
          entries: [
            {
              projectId: "00000000-0000-4000-8000-0000000000aa",
              name: "Side Product",
              startDate: null,
              endDate: null,
              role: null,
              link: null,
              lines: [
                { id: "p1", text: "Built it.", origin: { kind: "manual" } },
              ],
            },
          ],
        },
      ],
    };
    const moved: ResumeContent = {
      ...withProjects,
      sections: [
        withProjects.sections[0],
        withProjects.sections[2],
        withProjects.sections[1],
      ],
    };
    const text = async (content: ResumeContent) =>
      (
        await extractText(
          new Uint8Array(
            (await renderResumePdf({ content, language: "en-US" })).bytes
          ),
          { mergePages: true }
        )
      ).text;
    const usual = await text(withProjects);
    expect(usual.indexOf("EXPERIENCE")).toBeLessThan(usual.indexOf("PROJECTS"));
    const reordered = await text(moved);
    expect(reordered.indexOf("PROJECTS")).toBeLessThan(
      reordered.indexOf("EXPERIENCE")
    );
    // The plain text (copy, ATS, vectors) follows the same order.
    const plain = resumeText(moved);
    expect(plain.indexOf("Side Product")).toBeLessThan(plain.indexOf("Globex"));
    expect(resumeText(withProjects).indexOf("Globex")).toBeLessThan(
      resumeText(withProjects).indexOf("Side Product")
    );
  });

  it("measures the real number of pages", async () => {
    const short = await renderResumePdf({
      content: resume(3),
      language: "en-US",
    });
    expect(short.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(short.pages).toBe(1);
    const long = await renderResumePdf({
      content: resume(120),
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
    const content = resume(40);
    const P2 = "00000000-0000-4000-8000-000000000002";
    const older = {
      ...entryOf(resume(80)),
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
    expect(fitted.pages).toBeLessThanOrEqual(2);
    const [recent, old] = (fitted.content.sections[1] as Experience).entries;
    expect(old.lines.length).toBeLessThan(80);
    // The bullets of a recent experience are never cut.
    expect(recent.lines).toHaveLength(40);
    // Trimming drops lines from the end; it never rewrites one.
    expect(old.lines.map((line) => line.id)).toEqual(
      Array.from({ length: old.lines.length }, (_, index) => `b${index}`)
    );
    expect(old.lines).toEqual(older.lines.slice(0, old.lines.length));
  });

  it("leaves a resume too long as it is when only recent experiences are left", async () => {
    const content = resume(200);
    const fitted = await fitToPages({
      content,
      language: "en-US",
      maxPages: 2,
      ages: new Map(),
    });
    // The user is warned instead: the real page count says it runs over.
    expect(fitted.pages).toBeGreaterThan(2);
    expect(fitted.content).toEqual(content);
  });

  it("tightens spacing to fit a small overflow, and leaves the rest alone", async () => {
    const fits = await renderResumeFitted({
      content: resume(3),
      language: "en-US",
      maxPages: 2,
    });
    expect(fits.step).toBe(0);
    expect(fits.pages).toBe(1);
    // The first length that runs to a third page at the normal spacing.
    let bullets = 40;
    while (
      (await renderResumePdf({ content: resume(bullets), language: "en-US" }))
        .pages <= 2
    ) {
      bullets += 1;
    }
    const slight = await renderResumeFitted({
      content: resume(bullets),
      language: "en-US",
      maxPages: 2,
    });
    expect(slight.pages).toBe(2);
    expect(slight.step).toBeGreaterThan(0);
    const long = await renderResumeFitted({
      content: resume(bullets * 2),
      language: "en-US",
      maxPages: 2,
    });
    expect(long.step).toBe(0);
    expect(long.pages).toBeGreaterThan(2);
  }, 60_000);
});
