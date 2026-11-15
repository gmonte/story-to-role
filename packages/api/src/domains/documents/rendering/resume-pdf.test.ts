import { describe, expect, it } from "vitest";

import type { ResumeContent } from "../schemas/resume-content";
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
});
