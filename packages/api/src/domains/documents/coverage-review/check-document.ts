import { mentions } from "@repo/api/domains/profile/truth/lint";
import { findMarks } from "@repo/api/domains/profile/truth/marks";
import { ungivenFigures } from "@repo/api/domains/profile/truth/suggestions";

import { matchPurpose, type Purpose } from "../generation/assemble-resume";
import type { CareerContext } from "../generation/load-career-context";
import { withheld } from "../generation/profile-source";
import {
  lockedFactViolations,
  type WrittenLine,
  writtenLines,
} from "../generation/resume-checks";
import {
  experienceAge,
  type GenerationSettings,
} from "../schemas/generation-settings";
import type { ExperienceEntry, ResumeContent } from "../schemas/resume-content";

/**
 * What the coverage review's code checks find (resume spec, "Coverage
 * review"): each one blocks the document until it is fixed.
 */
export const coverageFindingCodes = [
  // An entry's employer, title or dates differ from the frozen profile, or
  // the profile has no such position.
  "lockedFact",
  // An entry has more bullets than the settings allow for its age.
  "bulletCount",
  // The document runs over its page limit.
  "pages",
  // A line carries a number the profile doesn't mark measured there (or a
  // placeholder or a figure mark).
  "figure",
  // A line names a term of the communication rules.
  "neverInclude",
  "neverClaim",
  // A line claims something its position says the person did not do.
  "notDone",
  // A line names a competency the profile marks as only studied.
  "studied",
  // A very old experience kept without the requirement that justifies it.
  "veryOld",
  // A cover letter has more paragraphs than the settings allow.
  "paragraphs",
] as const;
export type CoverageFindingCode = (typeof coverageFindingCodes)[number];

export type CoverageFinding = {
  code: CoverageFindingCode;
  // The written line at fault, when one is.
  lineId: string | null;
  // The position whose entry is at fault, when one is.
  positionId: string | null;
  // What the finding points at: the line's text, or the entry's title.
  text: string;
  // What the interface needs to word it (the figure, the term, the limit).
  params: Record<string, string | number>;
};

/** A tool line ("Tools: Kubernetes, Terraform") as the names it lists. */
function toolNames(evidence: CareerContext["evidence"]) {
  return evidence
    .filter((row) => row.kind === "tool")
    .flatMap((row) =>
      row.text
        .replace(/^[^:]*:\s*/, "")
        .split(/[,;]/)
        .map((name) => name.trim().replace(/\.$/, ""))
        .filter((name) => name && !name.includes(withheld))
    );
}

/**
 * What each position says the person did not do, as the names the profile
 * knows (competencies in use or studied, and tools), so "what I did not
 * do" is checked by name and never on free text. A name the position's own
 * lines use otherwise ("Tools: Terraform" with "did not run Terraform in
 * production") was used there: not denied.
 */
export function deniedNamesOf(context: CareerContext) {
  const knownNames = [
    ...new Set([
      ...context.skills.map((skill) => skill.name),
      ...context.studied,
      ...toolNames(context.evidence),
    ]),
  ];
  const usedAt = (positionId: string, name: string) =>
    context.evidence.some(
      (row) => row.positionId === positionId && mentions(row.text, name)
    );
  const deniedByPosition = new Map(
    context.positions.map((position) => [
      position.id,
      position.notDone.flatMap((text) =>
        knownNames
          .filter((name) => mentions(text, name) && !usedAt(position.id, name))
          .map((name) => ({ name, notDone: text }))
      ),
    ])
  );
  return (positionId: string | null) =>
    deniedByPosition.get(positionId ?? "") ?? [];
}

/**
 * The code checks of the coverage review, run over a resume's content and
 * what it froze: the profile version it was written from (as the context
 * read with that version), the settings of the generation that wrote it
 * and its purposes. Deterministic, so the editor runs them live on the
 * official snapshot: an edit that adds an unmarked figure shows a finding
 * at once, and the document is blocked until it is fixed.
 */
export function checkDocument(input: {
  content: ResumeContent;
  context: CareerContext;
  settings: GenerationSettings;
  // This month (YYYY-MM): what "recent" is measured from.
  today: string;
  purposes: Purpose[];
  // The opening's title, which code prints on the title line as written.
  targetTitle?: string | null;
  // The rendered PDF's measured pages. Without a file there is no finding:
  // an estimate is too rough to block (the editor warns on it instead).
  pages?: number | null;
}): CoverageFinding[] {
  const { content, context, settings } = input;
  const findings: CoverageFinding[] = [];
  const positionById = new Map(
    context.positions.map((position) => [position.id, position])
  );
  const entries = content.sections.flatMap((section) =>
    section.kind === "experience" ? section.entries : []
  );
  const entryTitle = (entry: ExperienceEntry) =>
    `${entry.title}, ${entry.employer}`;

  // Locked facts: printed by code, so a difference means tampering (or a
  // position the frozen version doesn't have).
  const violated = new Set(
    lockedFactViolations(content, context.positions, context.acceptedTitles)
  );
  for (const entry of entries) {
    if (!violated.has(entry.positionId)) continue;
    const position = positionById.get(entry.positionId);
    findings.push({
      code: "lockedFact",
      lineId: null,
      positionId: entry.positionId,
      text: entryTitle(entry),
      params: position
        ? {
            employer: position.employer,
            title: position.title,
            startDate: position.startDate ?? "",
            endDate: position.endDate ?? "",
          }
        : {},
    });
  }

  // Counts per the settings and the age of each experience; a very old one
  // only for a purpose of this document.
  for (const entry of entries) {
    const position = positionById.get(entry.positionId);
    if (!position) continue;
    const age = experienceAge(position, settings, input.today);
    const limit = {
      recent: settings.bulletsRecent,
      older: settings.bulletsOlder,
      very_old: settings.veryOld === "keep" ? settings.bulletsOlder : 1,
    }[age];
    if (age === "very_old" && settings.veryOld !== "keep") {
      const purpose =
        settings.veryOld === "relevant_only"
          ? matchPurpose(entry.relevance ?? null, input.purposes)
          : null;
      if (!purpose) {
        findings.push({
          code: "veryOld",
          lineId: null,
          positionId: entry.positionId,
          text: entryTitle(entry),
          params: { years: settings.veryOldYears },
        });
      }
    }
    if (entry.lines.length > limit) {
      findings.push({
        code: "bulletCount",
        lineId: null,
        positionId: entry.positionId,
        text: entryTitle(entry),
        params: { count: entry.lines.length, limit, age },
      });
    }
  }

  const pages = input.pages ?? null;
  if (pages !== null && pages > settings.resumeMaxPages) {
    findings.push({
      code: "pages",
      lineId: null,
      positionId: null,
      text: "",
      params: { pages, maxPages: settings.resumeMaxPages },
    });
  }

  const deniedNames = deniedNamesOf(context);
  // Only what the profile marks measured backs a figure: the lines of the
  // line's position (any position, for the summary or a competency group)
  // and the instructions that may back it.
  const figureSources = (line: WrittenLine) => [
    // The title line starts with the opening's title, numbers included.
    ...(line.id === "title_line" && input.targetTitle
      ? [input.targetTitle]
      : []),
    // A position's years are locked facts a line may name ("since 2019").
    ...context.positions
      .filter((position) => !line.positionId || position.id === line.positionId)
      .map(
        (position) => `${position.startDate ?? ""} ${position.endDate ?? ""}`
      ),
    ...context.evidence
      .filter((row) => !line.positionId || row.positionId === line.positionId)
      .map((row) => row.figures),
    ...context.instructions
      .filter(
        (row) =>
          !row.positionId ||
          !line.positionId ||
          row.positionId === line.positionId
      )
      .map((row) => row.text),
  ];
  const lineFinding = (
    line: WrittenLine,
    code: CoverageFindingCode,
    params: Record<string, string | number>
  ): CoverageFinding => ({
    code,
    lineId: line.id,
    positionId: line.positionId,
    text: line.text,
    params,
  });

  for (const line of writtenLines(content)) {
    const marks = findMarks(line.text).map((mark) =>
      line.text.slice(mark.from, mark.to)
    );
    const placeholders = [
      ...(line.text.includes(withheld) ? [withheld] : []),
      ...marks,
    ];
    const figures = ungivenFigures(line.text, figureSources(line));
    if (placeholders.length || figures.length) {
      findings.push(
        lineFinding(line, "figure", {
          figures: [...placeholders, ...figures].join(", "),
        })
      );
    }
    for (const term of context.rules.neverInclude) {
      if (mentions(line.text, term)) {
        findings.push(lineFinding(line, "neverInclude", { term }));
      }
    }
    for (const term of context.rules.neverClaim) {
      if (mentions(line.text, term)) {
        findings.push(lineFinding(line, "neverClaim", { term }));
      }
    }
    for (const name of context.studied) {
      if (mentions(line.text, name)) {
        findings.push(lineFinding(line, "studied", { name }));
      }
    }
    for (const denied of deniedNames(line.positionId)) {
      if (mentions(line.text, denied.name)) {
        findings.push(lineFinding(line, "notDone", denied));
      }
    }
  }
  return findings;
}
