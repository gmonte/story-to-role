import { randomUUID } from "node:crypto";

import { z } from "zod";

import { foldAccents } from "@repo/api/utils/text/fold-accents";

import type { Line } from "../schemas/document";
import {
  credentialSections,
  type CredentialSectionKind,
  type ResumeContent,
  type ResumeSection,
  type ResumeSectionKind,
} from "../schemas/resume-content";
import type { ResumeHeaderFields } from "../schemas/template";
import type { CareerContext } from "./load-career-context";

const draftLine = z.object({
  text: z.string(),
  evidence_ids: z.array(z.string()),
});

/**
 * What the writing model returns: wording and the evidence behind it, never
 * employers, titles or dates, which code takes from the evidence base.
 */
export const resumeDraftSchema = z.object({
  title_line: z.string(),
  summary: draftLine.nullable(),
  skills: z.array(
    z.object({
      label: z.string(),
      items: z.array(z.string()),
      evidence_ids: z.array(z.string()),
    })
  ),
  experience: z.array(
    z.object({
      position_id: z.string(),
      context: z.string().nullable(),
      bullets: z.array(draftLine),
    })
  ),
  projects: z.array(
    z.object({ project_id: z.string(), bullets: z.array(draftLine) })
  ),
});
export type ResumeDraft = z.infer<typeof resumeDraftSchema>;

/** A line code refused, reported to the editor in the next round. */
export type DroppedLine = {
  text: string;
  reason: "no_evidence" | "unsupported_figure" | "unknown_skill";
};

const normalize = (text: string) => foldAccents(text).toLowerCase();

/** Every figure in a line ("40%", "2021", "3") must appear in its evidence. */
function figuresBackedBy(text: string, evidenceTexts: string[]) {
  const source = evidenceTexts.join(" ");
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).every((figure) =>
    source.includes(figure)
  );
}

/**
 * Turns a draft into a snapshot's content, enforcing in code what the AI
 * may not decide (guided-interview spec, principle 4): locked facts come
 * from the positions; each line must cite evidence it was given, and every
 * figure in it must appear in that evidence; a skill must be an approved
 * skill or be spelled out in the evidence cited. Refused lines are dropped
 * and reported.
 */
export function assembleResume(input: {
  draft: ResumeDraft;
  context: CareerContext;
  sections: ResumeSectionKind[];
  header: ResumeHeaderFields;
  newLineId?: () => string;
}): { content: ResumeContent; dropped: DroppedLine[] } {
  const { draft, context } = input;
  const newLineId = input.newLineId ?? (() => randomUUID().slice(0, 8));
  const evidenceById = new Map(context.evidence.map((row) => [row.id, row]));
  const dropped: DroppedLine[] = [];

  function toLine(
    line: z.infer<typeof draftLine>,
    allowed: (evidenceId: string) => boolean
  ): Line | null {
    const evidenceIds = [...new Set(line.evidence_ids)].filter(
      (id) => evidenceById.has(id) && allowed(id)
    );
    const text = line.text.trim();
    if (!text) return null;
    if (evidenceIds.length === 0) {
      dropped.push({ text, reason: "no_evidence" });
      return null;
    }
    const texts = evidenceIds.map((id) => evidenceById.get(id)!.text);
    if (!figuresBackedBy(text, texts)) {
      dropped.push({ text, reason: "unsupported_figure" });
      return null;
    }
    return { id: newLineId(), text, origin: { kind: "evidence", evidenceIds } };
  }

  const build: Record<ResumeSectionKind, () => ResumeSection | null> = {
    summary: () => {
      const line = draft.summary && toLine(draft.summary, () => true);
      return line ? { kind: "summary", line } : null;
    },
    skills: () => {
      const groups = draft.skills.flatMap((group) => {
        const cited = group.evidence_ids.filter((id) => evidenceById.has(id));
        const citedText = normalize(
          cited.map((id) => evidenceById.get(id)!.text).join(" ")
        );
        const evidenceIds = new Set(cited);
        const items = group.items.filter((item) => {
          const skill = context.skills.find(
            (row) => normalize(row.name) === normalize(item)
          );
          if (skill) {
            skill.evidenceIds.forEach((id) => evidenceIds.add(id));
            return true;
          }
          if (citedText.includes(normalize(item))) return true;
          dropped.push({ text: item, reason: "unknown_skill" });
          return false;
        });
        return items.length > 0
          ? [
              {
                id: newLineId(),
                label: group.label.trim(),
                text: items.join(", "),
                origin: {
                  kind: "skill" as const,
                  evidenceIds: [...evidenceIds],
                },
              },
            ]
          : [];
      });
      return groups.length > 0 ? { kind: "skills", groups } : null;
    },
    experience: () => {
      const entries = context.positions.map((position) => {
        const drafted = draft.experience.find(
          (entry) => entry.position_id === position.id
        );
        return {
          positionId: position.id,
          employer: position.employer,
          title: position.title,
          startDate: position.startDate,
          endDate: position.endDate,
          context: drafted?.context?.trim() ? drafted.context.trim() : null,
          lines: (drafted?.bullets ?? []).flatMap(
            (bullet) =>
              toLine(
                bullet,
                (id) => evidenceById.get(id)!.positionId === position.id
              ) ?? []
          ),
        };
      });
      return entries.length > 0 ? { kind: "experience", entries } : null;
    },
    projects: () => {
      const entries = draft.projects.flatMap((drafted) => {
        const project = context.projects.find(
          (row) => row.id === drafted.project_id
        );
        if (!project) return [];
        const lines = drafted.bullets.flatMap(
          (bullet) =>
            toLine(bullet, (id) => {
              const evidence = evidenceById.get(id)!;
              return (
                evidence.projectId === project.id ||
                evidence.positionId === project.positionId
              );
            }) ?? []
        );
        return lines.length > 0
          ? [{ projectId: project.id, name: project.name, lines }]
          : [];
      });
      return entries.length > 0 ? { kind: "projects", entries } : null;
    },
    ...(Object.fromEntries(
      (Object.keys(credentialSections) as CredentialSectionKind[]).map(
        (kind) => [
          kind,
          () => {
            const entries = context.credentials
              .filter((row) => row.kind === credentialSections[kind])
              .map((row) => ({
                credentialId: row.id,
                title: row.title,
                institution: row.institution,
                level: row.level,
                startDate: row.startDate,
                endDate: row.endDate,
                inProgress: row.inProgress,
              }));
            return entries.length > 0 ? { kind, entries } : null;
          },
        ]
      )
    ) as Record<CredentialSectionKind, () => ResumeSection | null>),
  };

  // "Target title | technologies": the target title names the opening; each
  // technology must be an approved skill or spelled out in the evidence.
  function checkedTitleLine() {
    const [title, ...rest] = draft.title_line.split("|");
    const evidenceText = normalize(
      context.evidence.map((row) => row.text).join(" ")
    );
    const technologies = rest
      .join("|")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => {
        const known =
          context.skills.some(
            (skill) => normalize(skill.name) === normalize(item)
          ) || evidenceText.includes(normalize(item));
        if (!known) dropped.push({ text: item, reason: "unknown_skill" });
        return known;
      });
    return [title.trim(), technologies.join(", ")].filter(Boolean).join(" | ");
  }

  const { header } = input;
  return {
    content: {
      kind: "resume",
      header: {
        name: header.name,
        titleLine: checkedTitleLine(),
        contacts: [header.email, header.phone, header.linkedin, header.github]
          .map((value) => value.trim())
          .filter(Boolean),
        city: header.city.trim() || null,
      },
      sections: input.sections.flatMap((kind) => build[kind]() ?? []),
    },
    dropped,
  };
}
