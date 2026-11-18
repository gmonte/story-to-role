import { z } from "zod";

import type { ResumeContent, ResumeSection } from "../schemas/resume-content";
import { keepsFigures } from "./figures";

/**
 * What the writing model returns for an adaptation: new wording for each
 * line it was given, by id, and an equivalent for each position title.
 */
export const adaptationDraftSchema = z.object({
  title_line: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      // A skill group's label; null for other lines.
      label: z.string().nullable(),
    })
  ),
  contexts: z.array(
    z.object({ position_id: z.string(), context: z.string().nullable() })
  ),
  title_equivalents: z.array(
    z.object({ position_id: z.string(), title: z.string() })
  ),
});
export type AdaptationDraft = z.infer<typeof adaptationDraftSchema>;

/**
 * An adaptation (resume spec, "Adaptations"): the source's structure, line
 * ids and evidence trace are kept and only wording changes. A rewritten
 * line that brings a figure its source does not have is refused, keeping
 * the source wording, and reported. Employers and dates stay; each title
 * is the one chosen for the language (`titles`), or stays as it was.
 */
export function adaptContent(input: {
  source: ResumeContent;
  draft: AdaptationDraft;
  titles: Map<string, string>;
}): { content: ResumeContent; refused: string[] } {
  const { source, draft } = input;
  const items = new Map(draft.items.map((item) => [item.id, item]));
  const refused: string[] = [];

  const reword = <T extends { id: string; text: string }>(
    line: T,
    // A skills line is a list: a rewrite listing fewer items than its source
    // would silently drop one (a user's own addition among them).
    list = false
  ): T => {
    const text = items.get(line.id)?.text.trim();
    if (!text) return line;
    if (list && text.split(", ").length < line.text.split(", ").length) {
      return line;
    }
    if (!keepsFigures(line.text, text)) {
      refused.push(line.id);
      return line;
    }
    return { ...line, text };
  };
  const contextOf = (positionId: string, context: string | null) => {
    const adapted = draft.contexts.find(
      (row) => row.position_id === positionId
    );
    const text = adapted?.context?.trim();
    return context && text && keepsFigures(context, text) ? text : context;
  };

  const sections = source.sections.map((section): ResumeSection => {
    switch (section.kind) {
      case "summary":
        return { ...section, line: reword(section.line) };
      case "skills":
        return {
          ...section,
          groups: section.groups.map((group) => {
            const label = items.get(group.id)?.label?.trim();
            return {
              ...reword(group, true),
              label:
                label && keepsFigures(group.label, label) ? label : group.label,
            };
          }),
        };
      case "experience":
        return {
          ...section,
          entries: section.entries.map((entry) => ({
            ...entry,
            title: input.titles.get(entry.positionId) ?? entry.title,
            context: contextOf(entry.positionId, entry.context),
            lines: entry.lines.map((line) => reword(line)),
          })),
        };
      case "projects":
        return {
          ...section,
          entries: section.entries.map((entry) => ({
            ...entry,
            lines: entry.lines.map((line) => reword(line)),
          })),
        };
      default:
        return section;
    }
  });

  const titleLine = draft.title_line.trim();
  return {
    content: {
      ...source,
      header: {
        ...source.header,
        titleLine:
          titleLine && keepsFigures(source.header.titleLine, titleLine)
            ? titleLine
            : source.header.titleLine,
      },
      sections,
    },
    refused,
  };
}
