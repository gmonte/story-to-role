import { formatPeriod } from "@repo/api/domains/documents/rendering/output-conventions";
import type { OutputLanguage } from "@repo/api/domains/documents/schemas/document";
import type { ResumeSection } from "@repo/api/domains/documents/schemas/resume-content";

/**
 * A section as plain text, for application forms that ask for pasted text
 * (resume spec, "Rendering": Copy text).
 */
export function sectionText(section: ResumeSection, language: OutputLanguage) {
  switch (section.kind) {
    case "summary":
      return section.line.text;
    case "skills":
      return section.groups.map((g) => `${g.label}: ${g.text}`).join("\n");
    case "experience":
      return section.entries
        .map((entry) =>
          [
            `${entry.employer} — ${entry.title}${entry.context ? ` (${entry.context})` : ""}`,
            formatPeriod(entry.startDate, entry.endDate, language),
            ...entry.lines.map((line) => `• ${line.text}`),
          ].join("\n")
        )
        .join("\n\n");
    case "projects":
      return section.entries
        .map((entry) =>
          [entry.name, ...entry.lines.map((line) => `• ${line.text}`)].join(
            "\n"
          )
        )
        .join("\n\n");
    default:
      return section.entries
        .map((entry) =>
          [entry.institution, entry.title, entry.level]
            .filter(Boolean)
            .join(" · ")
        )
        .join("\n");
  }
}
