import { randomUUID } from "node:crypto";

import { z } from "zod";

import { mentions } from "@repo/api/domains/profile/truth/lint";
import { findMarks } from "@repo/api/domains/profile/truth/marks";
import { ungivenFigures } from "@repo/api/domains/profile/truth/suggestions";
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
import { withheld } from "./profile-source";

export const draftLine = z.object({
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
  "summary" | "skills" | "experience" | "projects"
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
  projects: Array<{ project_id: string; bullets: Array<DraftLine | KeptLine> }>;
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
    | "not_relevant"
    // It names a competency the profile says was only studied, or
    // something its communication rules say never to claim.
    | "studied_only"
    | "never_claim";
};

const normalize = (text: string) => foldAccents(text).toLowerCase();

/**
 * Every figure in a line ("40%", "1,8", "3") must be one its sources show:
 * a whole number, never a part of one, and a percentage only as one.
 */
function figuresBackedBy(text: string, sources: string[]) {
  return ungivenFigures(text, sources).length === 0;
}

// A target title is a role, in a few words.
const maxTitleLength = 60;

// Words that claim a level: a title may carry one only when the profile
// shows it.
const seniorityWords = [
  "junior",
  "júnior",
  "pleno",
  "mid-level",
  "senior",
  "sênior",
  "staff",
  "principal",
  "lead",
  "líder",
  "head",
  "manager",
  "gerente",
  "director",
  "diretor",
  "diretora",
  "coordenador",
  "coordenadora",
  "architect",
  "arquiteto",
  "arquiteta",
  "specialist",
  "especialista",
];

// A group of competencies is named in a few words ("Languages").
const maxLabelLength = 40;

/** A competency group's name: no number, nothing long enough to claim. */
function shortLabel(label: string) {
  return label
    .replace(/\d+/g, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, maxLabelLength)
    .trim();
}

// A position's context is a note of a few words, never a place for facts.
const maxContextLength = 40;

/**
 * The note next to a position's title ("parallel project"): written text
 * that cites nothing, so it holds no number and nothing long enough to be
 * a claim.
 */
function shortNote(context: string | null | undefined) {
  const note = context?.trim();
  return note && note.length <= maxContextLength && !/\d/.test(note)
    ? note
    : null;
}

/**
 * What a document is for: a requirement of the opening with the profile
 * lines the fit check found behind it, or a library document's focus
 * (which has no fit check: `evidenceIds` is null).
 */
export type Purpose = { text: string; evidenceIds: string[] | null };

// How much of the longer wording the shorter one must be to name it.
const minPurposeOverlap = 0.6;
// Words of a focus too common to prove anything.
const minFocusWordLength = 3;

/**
 * The purpose a very old experience says it is there for, when it names
 * one as the document writes it (or nearly: most of the wording); null for
 * a loose word that would match anything.
 */
export function matchPurpose(relevance: string | null, purposes: Purpose[]) {
  const wanted = normalize(relevance ?? "").trim();
  if (!wanted) return null;
  return (
    purposes.find((purpose) => {
      const known = normalize(purpose.text).trim();
      if (!known) return false;
      if (known === wanted) return true;
      const [shorter, longer] =
        known.length < wanted.length ? [known, wanted] : [wanted, known];
      return (
        longer.includes(shorter) &&
        shorter.length >= minPurposeOverlap * longer.length
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
  purposes: Purpose[];
  // An opening's title, printed by code so the title line holds no claim.
  // Null for a library document: the writer names its target from the
  // focus, and code keeps it only when it claims nothing the profile
  // doesn't show (else the latest position's title).
  targetTitle: string | null;
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
  const referenceProjectLines = new Map(
    reference.flatMap((section) =>
      section.kind === "projects"
        ? section.entries.flatMap((entry) =>
            entry.lines.map(
              (line) => [line.id, { line, projectId: entry.projectId }] as const
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
   * Why a text can't be printed whatever it cites: a placeholder or a
   * figure mark left in it, a competency the profile says was only
   * studied, or something its rules say never to claim.
   */
  function refusal(text: string): DroppedLine["reason"] | null {
    if (text.includes(withheld) || findMarks(text).length > 0) {
      return "unsupported_figure";
    }
    if (context.studied.some((name) => mentions(text, name))) {
      return "studied_only";
    }
    if (context.rules.neverClaim.some((term) => mentions(text, term))) {
      return "never_claim";
    }
    return null;
  }
  const evidenceText = [...context.evidence, ...context.instructions]
    .map((row) => row.text)
    .join("\n");
  /** A competency the person uses, or one the profile spells out. */
  const knownSkill = (item: string) =>
    !refusal(item) &&
    (context.skills.some(
      (skill) => normalize(skill.name) === normalize(item)
    ) ||
      mentions(evidenceText, item));
  /** A line kept from a reference still holds under the frozen profile. */
  function stillHolds(text: string, positionId: string | null) {
    const reason =
      refusal(text) ??
      (figuresBackedBy(text, [
        ...context.evidence
          .filter((row) => !positionId || row.positionId === positionId)
          .map((row) => row.figures),
        ...context.instructions.map((row) => row.text),
      ])
        ? null
        : ("unsupported_figure" as const));
    if (reason) dropped.push({ text, reason });
    return !reason;
  }

  /**
   * Whether a written line proves a purpose: it cites a profile line the
   * fit check found behind that requirement or, for a focus, a line that
   * names one of the focus's words.
   */
  function proves(line: Line, purpose: Purpose) {
    const cited = "evidenceIds" in line.origin ? line.origin.evidenceIds : [];
    if (purpose.evidenceIds) {
      return cited.some((id) => purpose.evidenceIds!.includes(id));
    }
    const words = purpose.text
      .split(/[^\p{L}\p{N}+#.]+/u)
      .filter((word) => word.length >= minFocusWordLength);
    return cited.some((id) => {
      const text = evidenceById.get(id)?.text ?? "";
      return words.some((word) => mentions(text, word));
    });
  }

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
    const reason =
      refusal(text) ??
      (figuresBackedBy(text, texts) ? null : ("unsupported_figure" as const));
    if (reason) {
      dropped.push({ text, reason });
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
      // An adjustment whose new summary was refused keeps the one it had,
      // as long as it still holds under the profile frozen now.
      const summary =
        line ?? (kept && stillHolds(kept.text, null) ? kept : null);
      return summary ? { kind: "summary", line: summary } : null;
    },
    skills: () => {
      const groups = draft.skills.flatMap((group) => {
        if (isKept(group)) {
          // The group as the resume has it, its items in the order asked;
          // nothing new enters.
          const existing = referenceGroups.get(group.keep);
          if (!existing) return [];
          const items = existing.text.split(", ").filter((item) => {
            // Still a competency in use under the profile frozen now.
            if (knownSkill(item)) return true;
            dropped.push({ text: item, reason: "unknown_skill" });
            return false;
          });
          if (items.length === 0) return [];
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
        const citedText = cited
          .map((id) => evidenceById.get(id)!.text)
          .join("\n");
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
          if (!refusal(item) && mentions(citedText, item)) return true;
          const instruction = citedInstructions.find((id) =>
            mentions(instructionById.get(id)!.text, item)
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
                label: shortLabel(group.label),
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
            return stillHolds(existing.line.text, position.id)
              ? [existing.line]
              : [];
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
          const purpose = matchPurpose(
            drafted?.relevance ?? null,
            input.purposes
          );
          // With the profile line that proves it: one the fit check found
          // behind that requirement, or, for a focus, one that names it.
          const proof = purpose && lines.find((line) => proves(line, purpose));
          if (!purpose || !proof) {
            if (drafted?.bullets.length) {
              dropped.push({
                text: `${position.title}, ${position.employer}`,
                reason: "not_relevant",
              });
            }
            return [];
          }
          return [{ ...entry, relevance: purpose.text, lines: [proof] }];
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
      // Each project of the profile, in its order (most recent first),
      // written like an experience of its age: bullets per the settings,
      // each citing the project's own lines, figures only as marked.
      const entries = context.projects.flatMap((project) => {
        const drafted = draft.projects.find(
          (entry) => entry.project_id === project.id
        );
        const keptIds = new Set<string>();
        const allKept = (drafted?.bullets ?? []).every(isKept);
        const lines = (drafted?.bullets ?? []).flatMap((bullet) => {
          if (isKept(bullet)) {
            const existing = referenceProjectLines.get(bullet.keep);
            if (
              existing?.projectId !== project.id ||
              keptIds.has(bullet.keep)
            ) {
              return [];
            }
            keptIds.add(bullet.keep);
            return stillHolds(existing.line.text, null) ? [existing.line] : [];
          }
          return (
            toLine(bullet, (id) => {
              const evidence = evidenceById.get(id)!;
              return (
                evidence.projectId === project.id ||
                (!!project.positionId &&
                  evidence.positionId === project.positionId)
              );
            }) ?? []
          );
        });
        if (lines.length === 0) return [];
        const age = experienceAge(project, input.settings, input.today);
        return [
          {
            projectId: project.id,
            name: project.name,
            startDate: project.startDate,
            endDate: project.endDate,
            role: project.role,
            link: project.link,
            // A kept project is printed as the reference had it.
            lines: allKept
              ? lines
              : lines.slice(
                  0,
                  age === "recent"
                    ? input.settings.bulletsRecent
                    : input.settings.bulletsOlder
                ),
          },
        ];
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

  /**
   * A library document's target title as the writer named it, when it
   * claims nothing: no number, nothing long, no former employer, and no
   * seniority the profile doesn't show.
   */
  function groundedTitle(title: string) {
    const known = [
      evidenceText,
      ...context.positions.map((position) => position.title),
    ].join("\n");
    const claimsSeniority = seniorityWords.some(
      (word) => mentions(title, word) && !mentions(known, word)
    );
    return title.length <= maxTitleLength &&
      !/\d/.test(title) &&
      !/\bex-/i.test(title) &&
      !claimsSeniority
      ? title
      : null;
  }

  // "Target title | technologies": the target title comes from code (see
  // `targetTitle`); each technology must be a competency in use or spelled
  // out in the profile.
  function checkedTitleLine() {
    const [head, ...tail] = draft.title_line.split("|");
    const hasHead = input.targetTitle === null && tail.length > 0;
    const writers = hasHead ? groundedTitle(head.trim()) : null;
    const title =
      input.targetTitle ?? writers ?? context.positions[0]?.title ?? "";
    const drafted = draft.title_line.includes("|")
      ? tail.join("|")
      : draft.title_line;
    const technologies = drafted
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => {
        const known = knownSkill(item);
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
