import { describe, expect, it } from "vitest";

import type { ResumeContent } from "../schemas/resume-content";
import { reprintFields } from "./reprint-fields";

const language = (title: string, level: string | null) => ({
  id: "c1",
  kind: "language" as const,
  title,
  institution: null,
  level,
  startDate: null,
  endDate: null,
});

const printed = (title: string, level: string | null) =>
  ({
    header: { city: null },
    positions: [],
    credentials: [language(title, level)],
  }) as never;

const content = {
  kind: "resume",
  header: { name: "Ana", titleLine: "", contacts: [], city: null },
  sections: [
    {
      kind: "languages",
      entries: [
        {
          credentialId: "c1",
          title: "Inglês",
          institution: null,
          level: "proficiência profissional C1",
          startDate: null,
          endDate: null,
        },
      ],
    },
  ],
} as unknown as ResumeContent;

describe("reprinting a resume's code-printed fields", () => {
  it("reprints a field printed before translations existed", () => {
    const result = reprintFields(
      content,
      printed("English (full professional proficiency, C1)", null),
      printed("English", "full professional proficiency C1"),
      printed("Inglês", "proficiência profissional C1")
    );
    const entry = (
      result.sections[0] as {
        entries: Array<{ title: string; level: string | null }>;
      }
    ).entries[0];
    expect(entry.title).toBe("English (full professional proficiency, C1)");
    expect(entry.level).toBeNull();
  });

  it("keeps a field the user edited", () => {
    const edited = structuredClone(content);
    (
      edited.sections[0] as { entries: Array<{ title: string }> }
    ).entries[0].title = "Inglês fluente";
    const result = reprintFields(
      edited,
      printed("English", null),
      printed("English", null),
      printed("Inglês", null)
    );
    expect(
      (result.sections[0] as { entries: Array<{ title: string }> }).entries[0]
        .title
    ).toBe("Inglês fluente");
  });
});
