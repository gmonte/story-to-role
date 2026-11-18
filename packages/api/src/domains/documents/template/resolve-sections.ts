import { foldAccents } from "@repo/api/utils/text/fold-accents";

import type { OutputLanguage } from "../schemas/document";
import type { ResumeSectionKind } from "../schemas/resume-content";
import type { TemplateSection } from "../schemas/template";

/**
 * Which sections a resume has, in template order (resume spec, "Global
 * template"). Code checks the conditions so the result is predictable: a
 * section with languages shows only in those output languages, and one with
 * keywords only when the opening's terms or the library focus mention one.
 * The application's forced choices win over everything. Projects always
 * comes right after Experience, whatever the template's order (owner's
 * decision: projects read as a complement to the positions, never as one).
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

  const kinds = input.template
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
  return projectsAfterExperience(kinds);
}

/** The same kinds, with Projects moved to right after Experience. */
export function projectsAfterExperience(kinds: ResumeSectionKind[]) {
  if (!kinds.includes("projects") || !kinds.includes("experience")) {
    return kinds;
  }
  const without = kinds.filter((kind) => kind !== "projects");
  const at = without.indexOf("experience") + 1;
  return [
    ...without.slice(0, at),
    "projects" as ResumeSectionKind,
    ...without.slice(at),
  ];
}
