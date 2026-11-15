import { foldAccents } from "@repo/api/utils/text/fold-accents";

import type { OutputLanguage } from "../schemas/document";
import type { ResumeSectionKind } from "../schemas/resume-content";
import type { TemplateSection } from "../schemas/template";

/**
 * Which sections a resume has, in template order (resume spec, "Global
 * template"). Code checks the conditions so the result is predictable: a
 * section with languages shows only in those output languages, and one with
 * keywords only when the opening's terms or the library focus mention one.
 * The application's forced choices win over everything.
 */
export function resolveSections(input: {
  template: TemplateSection[];
  language: OutputLanguage;
  /** The opening's extracted terms, or the library document's focus. */
  topics: string[];
  forcedIn?: ResumeSectionKind[];
  forcedOut?: ResumeSectionKind[];
}): ResumeSectionKind[] {
  const topics = input.topics.map((topic) => foldAccents(topic).toLowerCase());
  const mentions = (keyword: string) => {
    const folded = foldAccents(keyword).toLowerCase();
    return topics.some((topic) => topic.includes(folded));
  };

  return input.template
    .filter((section) => {
      if (input.forcedOut?.includes(section.kind)) return false;
      if (input.forcedIn?.includes(section.kind)) return true;
      if (!section.enabled) return false;
      if (
        section.languages.length > 0 &&
        !section.languages.includes(input.language)
      ) {
        return false;
      }
      return section.keywords.length === 0 || section.keywords.some(mentions);
    })
    .map((section) => section.kind);
}
