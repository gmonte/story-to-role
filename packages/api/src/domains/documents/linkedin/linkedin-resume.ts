import type { LinkedinContent } from "../schemas/linkedin-content";
import type { ResumeContent } from "../schemas/resume-content";

/**
 * A LinkedIn text as the resume machinery reads it: its About as the
 * summary and its experiences as the experience section, with no header.
 * The resume's code checks (locked facts, figures, communication rules,
 * bullet counts) and the coverage review run on this view, so LinkedIn has
 * no checks of its own to drift from the resume's.
 */
export function linkedinAsResume(content: LinkedinContent): ResumeContent {
  return {
    kind: "resume",
    header: { name: "", titleLine: "", contacts: [], city: null },
    sections: [
      { kind: "summary", line: content.about },
      {
        kind: "experience",
        entries: content.experiences.map((entry) => ({
          ...entry,
          context: null,
          relevance: null,
        })),
      },
    ],
  };
}

/** The About's paragraphs, as the editor and the copy action split them. */
export const aboutParagraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

/** An experience as text to paste on LinkedIn: the title line, then bullets. */
export function experienceText(entry: LinkedinContent["experiences"][number]) {
  return entry.lines.map((line) => `• ${line.text}`).join("\n");
}

/** The text a LinkedIn section copies: the About, or one experience's. */
export function sectionText(content: LinkedinContent, section: string) {
  if (section === "about")
    return aboutParagraphs(content.about.text).join("\n\n");
  const entry = content.experiences.find((row) => row.positionId === section);
  return entry ? experienceText(entry) : null;
}
