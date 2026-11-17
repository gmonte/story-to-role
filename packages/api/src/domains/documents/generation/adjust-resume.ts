import { z } from "zod";

import type { ResumeContent } from "../schemas/resume-content";
import type { AssemblyDraft } from "./assemble-resume";

const draftLine = z.object({
  text: z.string(),
  evidence_ids: z.array(z.string()),
});

/**
 * What the model returns for an adjustment (the method's prompt 04b): a
 * new order for what the resume already says, a summary, and at most a new
 * bullet where the profile has the fact. It can't rewrite a bullet: it only
 * names it.
 */
export const adjustDraftSchema = z.object({
  // Up to five lines: what changed from the resume it started from.
  changes: z.array(z.string()).catch([]),
  title_line: z.string(),
  summary: draftLine.nullable(),
  skills: z.array(
    z.object({ group_id: z.string(), items: z.array(z.string()) })
  ),
  experience: z.array(
    z.object({
      position_id: z.string(),
      relevance: z.string().nullable().catch(null),
      bullet_ids: z.array(z.string()),
      added: z.array(draftLine).catch([]),
    })
  ),
});
export type AdjustDraft = z.infer<typeof adjustDraftSchema>;

/**
 * The reference resume with each experience pointing at the position the
 * frozen profile has for it. A position's id comes from its employer, title
 * and start, so one whose title or employer was corrected since has a new
 * id: it is found again by its start and whichever of the two still
 * matches, and its bullets go with it.
 */
export function relinkReference(
  reference: ResumeContent,
  positions: Array<{
    id: string;
    employer: string;
    title: string;
    startDate: string | null;
  }>
): ResumeContent {
  const ids = new Set(positions.map((position) => position.id));
  const taken = new Set(
    reference.sections.flatMap((section) =>
      section.kind === "experience"
        ? section.entries
            .map((entry) => entry.positionId)
            .filter((id) => ids.has(id))
        : []
    )
  );
  return {
    ...reference,
    sections: reference.sections.map((section) =>
      section.kind === "experience"
        ? {
            ...section,
            entries: section.entries.map((entry) => {
              if (ids.has(entry.positionId)) return entry;
              const match = positions.find(
                (position) =>
                  !taken.has(position.id) &&
                  position.startDate === entry.startDate &&
                  (position.employer === entry.employer ||
                    position.title === entry.title)
              );
              if (!match) return entry;
              taken.add(match.id);
              return { ...entry, positionId: match.id };
            }),
          }
        : section
    ),
  };
}

/**
 * The adjustment as a draft to assemble: every bullet and competency of the
 * reference is kept by its id, in the order asked (what wasn't named keeps
 * its place after what was), so only the order, the summary and the new
 * bullets come from the model.
 */
export function adjustmentDraft(
  draft: AdjustDraft,
  reference: ResumeContent
): AssemblyDraft {
  const experience = reference.sections.flatMap((section) =>
    section.kind === "experience" ? section.entries : []
  );
  const groups = reference.sections.flatMap((section) =>
    section.kind === "skills" ? section.groups : []
  );
  const summary = reference.sections.find(
    (section) => section.kind === "summary"
  );
  const ordered = <T>(asked: T[], all: T[]) => [
    ...asked.filter(
      (id, index) => all.includes(id) && asked.indexOf(id) === index
    ),
    ...all.filter((id) => !asked.includes(id)),
  ];
  const askedGroups = ordered(
    draft.skills.map((group) => group.group_id),
    groups.map((group) => group.id)
  );

  return {
    emphasis: draft.changes,
    title_line: draft.title_line,
    summary:
      draft.summary ??
      (summary?.kind === "summary" ? { keep: summary.line.id } : null),
    skills: askedGroups.map((id) => ({
      keep: id,
      items: draft.skills.find((group) => group.group_id === id)?.items ?? [],
    })),
    experience: experience.map((entry) => {
      const asked = draft.experience.find(
        (row) => row.position_id === entry.positionId
      );
      const ids = entry.lines.map((line) => line.id);
      const named = (asked?.bullet_ids ?? []).filter((id) => ids.includes(id));
      return {
        position_id: entry.positionId,
        context: entry.context,
        relevance: asked?.relevance ?? entry.relevance ?? null,
        bullets: [
          ...ordered(named, named).map((keep) => ({ keep })),
          ...(asked?.added ?? []),
          ...ids.filter((id) => !named.includes(id)).map((keep) => ({ keep })),
        ],
      };
    }),
    projects: [],
  };
}
