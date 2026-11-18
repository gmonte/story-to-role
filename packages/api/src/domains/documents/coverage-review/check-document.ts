import { neverIncludeTerms } from "@repo/api/domains/profile/rules/never-include-terms";
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
import type { LineOrigin, OutputLanguage } from "../schemas/document";
import { checkBulletShape } from "../writing/bullet-format";
import type { ExperienceEntry, ResumeContent } from "../schemas/resume-content";

/**
 * What the coverage review's code checks find (resume spec, "Coverage
 * review"): each one is pointed out, and none blocks the document (resume
 * spec, "Document workspace": the PDF asks for “Generate PDF anyway”).
 */
export const coverageFindingCodes = [
  // A line that doesn't trace to the frozen profile version: typed by the
  // user, or accepted from the agent without profile passages. "Add to the
  // profile" proposes it in the profile's draft.
  "notInProfile",
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
  // A line still names something by its real name, though the profile's
  // public names say how to write it.
  "publicName",
  "neverClaim",
  // A line claims something its position says the person did not do.
  "notDone",
  // A line names a competency the profile marks as only studied.
  "studied",
  // A very old experience kept without the requirement that justifies it.
  "veryOld",
  // A cover letter has more paragraphs than the settings allow.
  "paragraphs",
  // A resume or LinkedIn bullet that is off the product's bullet format in
  // a way code can tell (a bare list of technologies, too long, or opening
  // with “Responsible for” or a noun). Ignorable, never blocking.
  "bulletShape",
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

/**
 * Whether a line rests on the frozen profile version (resume spec,
 * "Document workspace": a line that doesn't is "not in your profile"): a
 * profile line it cites that the version has, an instruction, a company
 * fact, a motivation point or a credential; a line the user reworded
 * keeps those. A line the user typed, or one whose cited passages the
 * version no longer holds, doesn't.
 */
export function tracesToProfile(
  origin: LineOrigin | null,
  context: Pick<CareerContext, "evidence" | "careerDirection">
) {
  // Text code prints (the title line, a group's label) has no origin.
  if (!origin || origin.kind === "manual") return origin === null;
  if (origin.kind === "credential") return true;
  if (origin.kind === "instruction") return true;
  if (
    (origin.kind === "letter" || origin.kind === "edited") &&
    (origin.instructionIds.length > 0 ||
      origin.companyFactIds.length > 0 ||
      origin.motivationPointIds.length > 0)
  ) {
    return true;
  }
  const known = new Set([
    ...context.evidence.map((row) => row.id),
    ...context.careerDirection.map((row) => row.id),
  ]);
  return origin.evidenceIds.some((id) => known.has(id));
}

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
 * at once.
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
  // The document's output language, for the bullet shape check.
  language?: OutputLanguage;
  // The rendered PDF's measured pages. Without a file there is no finding:
  // an estimate is too rough to point out (the editor warns on it instead).
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
    if (!tracesToProfile(line.origin, context)) {
      findings.push(lineFinding(line, "notInProfile", {}));
    }
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
    for (const term of neverIncludeTerms(context.rules.neverInclude)) {
      if (mentions(line.text, term)) {
        findings.push(lineFinding(line, "neverInclude", { term }));
      }
    }
    for (const name of context.rules.publicNames) {
      if (mentions(line.text, name.original)) {
        findings.push(
          lineFinding(line, "publicName", {
            term: name.original,
            publicName: name.public,
          })
        );
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

  for (const section of content.sections) {
    if (section.kind !== "experience" && section.kind !== "projects") continue;
    for (const entry of section.entries) {
      const positionId = "positionId" in entry ? entry.positionId : null;
      for (const bullet of entry.lines) {
        const problems = checkBulletShape(
          bullet.text,
          input.language ?? "en-US"
        );
        if (!problems.length) continue;
        findings.push({
          code: "bulletShape",
          lineId: bullet.id,
          positionId,
          text: bullet.text,
          params: { problems: problems.join(",") },
        });
      }
    }
  }
  return findings;
}
