"use client";

import type {
  OutputLanguage,
  ReviewDepth,
  SnapshotOrigin,
  WritingLevel,
} from "@repo/api/domains/documents/schemas/document";
import type { ResumeSectionKind } from "@repo/api/domains/documents/schemas/resume-content";
import { useTranslation } from "@repo/intl/use-translation";

export function useDocumentLabels() {
  const t = useTranslation();

  const language = (value: OutputLanguage) =>
    value === "en-US"
      ? t.formatMessage({ defaultMessage: "English" })
      : t.formatMessage({ defaultMessage: "Portuguese" });

  return {
    language,
    /** A version's tab: its language, plus its label when one repeats. */
    version(version: { language: OutputLanguage; label: string | null }) {
      return version.label
        ? t.formatMessage(
            { defaultMessage: "{language} · {label}" },
            { language: language(version.language), label: version.label }
          )
        : language(version.language);
    },
    reviewDepth(depth: ReviewDepth) {
      switch (depth) {
        case "quick":
          return t.formatMessage({ defaultMessage: "Quick" });
        case "thorough":
          return t.formatMessage({ defaultMessage: "Thorough" });
      }
    },
    writingLevel(level: WritingLevel) {
      switch (level) {
        case "standard":
          return t.formatMessage({ defaultMessage: "Standard" });
        case "maximum":
          return t.formatMessage({ defaultMessage: "Maximum" });
      }
    },
    origin(origin: SnapshotOrigin) {
      switch (origin) {
        case "generated":
          return t.formatMessage({ defaultMessage: "Generated" });
        case "adapted":
          return t.formatMessage({ defaultMessage: "Adapted" });
        case "edited":
          return t.formatMessage({ defaultMessage: "Edited" });
        case "restored":
          return t.formatMessage({ defaultMessage: "Restored" });
        case "copied":
          return t.formatMessage({ defaultMessage: "Copied" });
        case "suggested":
          return t.formatMessage({ defaultMessage: "Suggested" });
      }
    },
    section(kind: ResumeSectionKind) {
      switch (kind) {
        case "summary":
          return t.formatMessage({ defaultMessage: "Summary" });
        case "skills":
          return t.formatMessage({ defaultMessage: "Skills" });
        case "experience":
          return t.formatMessage({ defaultMessage: "Experience" });
        case "education":
          return t.formatMessage({ defaultMessage: "Education" });
        case "languages":
          return t.formatMessage({ defaultMessage: "Languages" });
        case "certifications":
          return t.formatMessage({ defaultMessage: "Certifications" });
        case "projects":
          return t.formatMessage({ defaultMessage: "Projects" });
        case "publications":
          return t.formatMessage({ defaultMessage: "Publications" });
        case "awards":
          return t.formatMessage({ defaultMessage: "Awards" });
        case "volunteering":
          return t.formatMessage({ defaultMessage: "Volunteering" });
        case "courses":
          return t.formatMessage({ defaultMessage: "Courses" });
      }
    },
  };
}
