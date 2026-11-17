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
import {
  experienceAge,
  type GenerationSettings,
} from "../schemas/generation-settings";
import type { CareerContext } from "./load-career-context";

const draftLine = z.object({
  text: z.string(),
  evidence_ids: z.array(z.string()),
});

/**
 * What the writing model returns: wording and the evidence behind it, never
 * employers, titles or dates, which code takes from the profile.
 */
export const resumeDraftSchema = z.object({
  // Up to five lines: what the document brings forward and what it leaves
  // in the background (resume spec, "Generation rules").
  emphasis: z.array(z.string()).catch([]),
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
      // For a very old experience: the requirement (or the focus) it is
      // there for, as the opening writes it. Null for the others.
      relevance: z.string().nullable().catch(null),
      bullets: z.array(draftLine),
    })
  ),
  projects: z
    .array(z.object({ project_id: z.string(), bullets: z.array(draftLine) }))
    .catch([]),
});
export type ResumeDraft = z.infer<typeof resumeDraftSchema>;

type DraftLine = z.infer<typeof draftLine>;
// A line of the resume being adjusted, kept word for word by its id.
type KeptLine = { keep: string };

/**
 * A draft as code assembles it: what a writer drafted, or, for an
 * adjustment, lines and competency groups of an existing resume kept by
 * their ids in a new order.
 */
export type AssemblyDraft = Omit<
  ResumeDraft,
  "summary" | "skills" | "experience"
> & {
  summary: DraftLine | KeptLine | null;
  skills: Array<
    ResumeDraft["skills"][number] | (KeptLine & { items: string[] })
  >;
  experience: Array<
    Omit<ResumeDraft["experience"][number], "bullets"> & {
      bullets: Array<DraftLine | KeptLine>;
    }
  >;
};

const isKept = (line: object): line is KeptLine => "keep" in line;

/** A line code refused, reported to the editor in the next round. */
export type DroppedLine = {
  text: string;
  reason:
    | "no_evidence"
    | "unsupported_figure"
    | "unknown_skill"
    // A very old experience with no requirement that justifies it.
    | "not_relevant";
};

const normalize = (text: string) => foldAccents(text).toLowerCase();

/** Every figure in a line ("40%", "2021", "3") must appear in its evidence. */
function figuresBackedBy(text: string, evidenceTexts: string[]) {
  // Whole numbers, never a part of one: a measured "15" doesn't back a "5".
  const figures = (value: string) =>
    (value.match(/\d+(?:[.,]\d+)*/g) ?? []).map((figure) =>
      figure.replace(/,/g, ".")
    );
  const known = new Set(figures(evidenceTexts.join(" ")));
  return figures(text).every((figure) => known.has(figure));
}

// A position's context is a note of a few words, never a place for facts.
const maxContextLength = 40;

/**
 * The note next to a position's title ("parallel project"): the only
 * written text that cites nothing, so it holds no number and nothing long
 * enough to be a claim.
 */
function shortNote(context: string | null | undefined) {
  const note = context?.trim();
  return note && note.length <= maxContextLength && !/\d/.test(note)
    ? note
    : null;
}

/**
 * The requirement (or focus) a very old experience says it is there for,
 * as the document's purpose writes it; null when it names none of them.
 */
export function matchPurpose(relevance: string | null, purposes: string[]) {
  const wanted = normalize(relevance ?? "").trim();
  if (!wanted) return null;
  return (
    purposes.find((purpose) => {
      const known = normalize(purpose).trim();
      return (
        !!known &&
        (known === wanted || known.includes(wanted) || wanted.includes(known))
      );
    }) ?? null
  );
}

/**
 * Turns a draft into a snapshot's content, enforcing in code what the AI
 * may not decide (profile spec, principles): locked facts come from the
 * profile's positions (with this application's overrides); each line must
 * cite profile lines or instructions it was given, and every figure in it
 * must be one the profile marks measured there; a skill must be a
 * competency the person uses or be spelled out in what the group cites.
 * The generation settings decide how many bullets each experience keeps,
 * and whether a very old one enters at all. Refused lines are dropped and
 * reported.
 */
export function assembleResume(input: {
  draft: AssemblyDraft;
  // The resume an adjustment starts from: where kept lines come from.
  reference?: ResumeContent | null;
  context: CareerContext;
  sections: ResumeSectionKind[];
  settings: GenerationSettings;
  // This month (YYYY-MM): what "recent" is measured from.
  today: string;
  // What the document is for: the opening's requirements, or the focus.
  purposes: string[];
  // The account's name, printed only when the profile gives none.
  fallbackName?: string;
  newLineId?: () => string;
}): { content: ResumeContent; dropped: DroppedLine[] } {
  const { draft, context } = input;
  const newLineId = input.newLineId ?? (() => randomUUID().slice(0, 8));
  const evidenceById = new Map(context.evidence.map((row) => [row.id, row]));
  const instructionById = new Map(
    context.instructions.map((row) => [row.id, row])
  );
  const dropped: DroppedLine[] = [];
  const reference = input.reference?.sections ?? [];
  const referenceBullets = new Map(
    reference.flatMap((section) =>
      section.kind === "experience"
        ? section.entries.flatMap((entry) =>
            entry.lines.map(
              (line) =>
                [line.id, { line, positionId: entry.positionId }] as const
            )
          )
        : []
    )
  );
  const referenceGroups = new Map(
    reference.flatMap((section) =>
      section.kind === "skills"
        ? section.groups.map((group) => [group.id, group] as const)
        : []
    )
  );
  const referenceSummary = reference.find(
    (section) => section.kind === "summary"
  );

  /**
   * An instruction backs a line when it is about the same position, or
   * about none in particular; `allowed` judges evidence.
   */
  function toLine(
    line: DraftLine,
    allowed: (evidenceId: string) => boolean,
    positionId: string | null = null
  ): Line | null {
    const cited = [...new Set(line.evidence_ids)];
    const evidenceIds = cited.filter(
      (id) => evidenceById.has(id) && allowed(id)
    );
    const instructionIds = cited.filter((id) => {
      const instruction = instructionById.get(id);
      return (
        !!instruction &&
        (!instruction.positionId || instruction.positionId === positionId)
      );
    });
    const text = line.text.trim();
    if (!text) return null;
    if (evidenceIds.length === 0 && instructionIds.length === 0) {
      dropped.push({ text, reason: "no_evidence" });
      return null;
    }
    const texts = [
      // Only what the profile marks measured backs a figure.
      ...evidenceIds.map((id) => evidenceById.get(id)!.figures),
      ...instructionIds.map((id) => instructionById.get(id)!.text),
    ];
    if (!figuresBackedBy(text, texts)) {
      dropped.push({ text, reason: "unsupported_figure" });
      return null;
    }
    return {
      id: newLineId(),
      text,
      origin:
        instructionIds.length > 0
          ? { kind: "instruction", instructionIds, evidenceIds }
          : { kind: "evidence", evidenceIds },
    };
  }

  const build: Record<ResumeSectionKind, () => ResumeSection | null> = {
    summary: () => {
      const kept =
        referenceSummary?.kind === "summary" ? referenceSummary.line : null;
      const line =
        draft.summary && !isKept(draft.summary)
          ? toLine(draft.summary, () => true)
          : null;
      // An adjustment whose new summary was refused keeps the one it had.
      const summary = line ?? kept;
      return summary ? { kind: "summary", line: summary } : null;
    },
    skills: () => {
      const groups = draft.skills.flatMap((group) => {
        if (isKept(group)) {
          // The group as the resume has it, its items in the order asked;
          // nothing new enters.
          const existing = referenceGroups.get(group.keep);
          if (!existing) return [];
          const items = existing.text.split(", ");
          const asked = group.items.flatMap(
            (item) =>
              items.find((known) => normalize(known) === normalize(item)) ?? []
          );
          return [
            {
              ...existing,
              text: [
                ...new Set([
                  ...asked,
                  ...items.filter((item) => !asked.includes(item)),
                ]),
              ].join(", "),
            },
          ];
        }
        const cited = group.evidence_ids.filter((id) => evidenceById.has(id));
        const citedText = normalize(
          cited.map((id) => evidenceById.get(id)!.text).join(" ")
        );
        const citedInstructions = group.evidence_ids.filter((id) =>
          instructionById.has(id)
        );
        const evidenceIds = new Set(cited);
        // Instructions that spell out a skill the evidence does not show.
        const instructionIds = new Set<string>();
        const items = group.items.filter((item) => {
          const skill = context.skills.find(
            (row) => normalize(row.name) === normalize(item)
          );
          if (skill) {
            skill.evidenceIds.forEach((id) => evidenceIds.add(id));
            return true;
          }
          if (citedText.includes(normalize(item))) return true;
          const instruction = citedInstructions.find((id) =>
            normalize(instructionById.get(id)!.text).includes(normalize(item))
          );
          if (instruction) {
            instructionIds.add(instruction);
            return true;
          }
          dropped.push({ text: item, reason: "unknown_skill" });
          return false;
        });
        return items.length > 0
          ? [
              {
                id: newLineId(),
                label: group.label.trim(),
                text: items.join(", "),
                origin:
                  instructionIds.size > 0
                    ? {
                        kind: "instruction" as const,
                        instructionIds: [...instructionIds],
                        evidenceIds: [...evidenceIds],
                      }
                    : {
                        kind: "skill" as const,
                        evidenceIds: [...evidenceIds],
                      },
              },
            ]
          : [];
      });
      // A competency is listed once, in the first group that names it.
      const listed = new Set<string>();
      const unique = groups.flatMap((group) => {
        const items = group.text.split(", ").filter((item) => {
          const name = normalize(item);
          if (listed.has(name)) return false;
          listed.add(name);
          return true;
        });
        return items.length > 0 ? [{ ...group, text: items.join(", ") }] : [];
      });
      return unique.length > 0 ? { kind: "skills", groups: unique } : null;
    },
    experience: () => {
      const entries = context.positions.flatMap((position) => {
        const drafted = draft.experience.find(
          (entry) => entry.position_id === position.id
        );
        const keptIds = new Set<string>();
        const lines = (drafted?.bullets ?? []).flatMap((bullet) => {
          if (isKept(bullet)) {
            const existing = referenceBullets.get(bullet.keep);
            if (
              existing?.positionId !== position.id ||
              keptIds.has(bullet.keep)
            ) {
              return [];
            }
            keptIds.add(bullet.keep);
            return [existing.line];
          }
          return (
            toLine(
              bullet,
              (id) => evidenceById.get(id)!.positionId === position.id,
              position.id
            ) ?? []
          );
        });
        const entry = {
          positionId: position.id,
          employer: position.employer,
          title: position.title,
          startDate: position.startDate,
          endDate: position.endDate,
          context: shortNote(drafted?.context),
        };
        const age = experienceAge(position, input.settings, input.today);
        if (age === "very_old" && input.settings.veryOld !== "keep") {
          if (input.settings.veryOld === "leave_out") return [];
          // It enters only for a requirement of this document, with one
          // bullet tied to it.
          const relevance = matchPurpose(
            drafted?.relevance ?? null,
            input.purposes
          );
          if (!relevance || lines.length === 0) {
            if (drafted?.bullets.length) {
              dropped.push({
                text: `${position.title}, ${position.employer}`,
                reason: "not_relevant",
              });
            }
            return [];
          }
          return [{ ...entry, relevance, lines: lines.slice(0, 1) }];
        }
        return [
          {
            ...entry,
            lines: lines.slice(
              0,
              age === "recent"
                ? input.settings.bulletsRecent
                : input.settings.bulletsOlder
            ),
          },
        ];
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
      [...context.evidence, ...context.instructions]
        .map((row) => row.text)
        .join(" ")
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

  // Contact data comes from the profile, like every other fact.
  const { header } = context;
  return {
    content: {
      kind: "resume",
      header: {
        name: header.name.trim() || (input.fallbackName ?? ""),
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
