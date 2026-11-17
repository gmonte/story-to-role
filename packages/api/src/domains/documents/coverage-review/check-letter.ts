import { mentions } from "@repo/api/domains/profile/truth/lint";
import { findMarks } from "@repo/api/domains/profile/truth/marks";
import { ungivenFigures } from "@repo/api/domains/profile/truth/suggestions";

import type { CareerContext } from "../generation/load-career-context";
import { withheld } from "../generation/profile-source";
import type { CoverLetterContent } from "../schemas/cover-letter-content";
import type { GenerationSettings } from "../schemas/generation-settings";
import {
  type CoverageFinding,
  type CoverageFindingCode,
  deniedNamesOf,
} from "./check-document";

/**
 * The positions whose lines a paragraph rests on: those of the profile
 * lines it cites and of the instructions it cites.
 */
function positionsOf(
  origin: { evidenceIds: string[]; instructionIds: string[] },
  context: CareerContext
) {
  return new Set(
    [
      ...context.evidence
        .filter((row) => origin.evidenceIds.includes(row.id))
        .map((row) => row.positionId),
      ...context.instructions
        .filter((row) => origin.instructionIds.includes(row.id))
        .map((row) => row.positionId),
    ].filter((positionId): positionId is string => !!positionId)
  );
}

/**
 * What the rules and "what I did not do" forbid a letter paragraph, as
 * the finding code and its params. Shared by the check run live and the
 * assembly, which refuses such a paragraph before it is written.
 */
export function letterViolations(
  text: string,
  context: CareerContext,
  evidenceIds: string[],
  instructionIds: string[] = []
): Array<{ code: CoverageFindingCode; params: Record<string, string> }> {
  const violations: Array<{
    code: CoverageFindingCode;
    params: Record<string, string>;
  }> = [];
  for (const term of context.rules.neverInclude) {
    if (mentions(text, term)) {
      violations.push({ code: "neverInclude", params: { term } });
    }
  }
  for (const term of context.rules.neverClaim) {
    if (mentions(text, term)) {
      violations.push({ code: "neverClaim", params: { term } });
    }
  }
  for (const name of context.studied) {
    if (mentions(text, name)) {
      violations.push({ code: "studied", params: { name } });
    }
  }
  const denied = deniedNamesOf(context);
  for (const positionId of positionsOf(
    { evidenceIds, instructionIds },
    context
  )) {
    for (const row of denied(positionId)) {
      if (mentions(text, row.name)) {
        violations.push({
          code: "notDone",
          params: { name: row.name, notDone: row.notDone },
        });
      }
    }
  }
  return violations;
}

/**
 * The code checks of the coverage review on a cover letter (resume spec,
 * "Coverage review"), against what it froze: the profile version it was
 * written from and the settings of its generation. Deterministic, so the
 * editor runs them live: paragraphs and pages within the settings (pages
 * only once the PDF is rendered and measured), every figure one the
 * profile marks measured (or the user wrote), no term the communication
 * rules forbid, nothing claimed that a position says the person did not
 * do. A paragraph a user wrote by hand is checked like any other.
 */
export function checkLetter(input: {
  content: CoverLetterContent;
  context: CareerContext;
  settings: GenerationSettings;
  // The texts of the approved company facts and the motivation points the
  // letter cites: figures there are the user's or the company's own.
  ownSources: string[];
  pages?: number | null;
}): CoverageFinding[] {
  const { content, context, settings } = input;
  const findings: CoverageFinding[] = [];
  if (content.paragraphs.length > settings.letterMaxParagraphs) {
    findings.push({
      code: "paragraphs",
      lineId: null,
      positionId: null,
      text: "",
      params: {
        count: content.paragraphs.length,
        limit: settings.letterMaxParagraphs,
      },
    });
  }
  const pages = input.pages ?? null;
  if (pages !== null && pages > settings.letterMaxPages) {
    findings.push({
      code: "pages",
      lineId: null,
      positionId: null,
      text: "",
      params: { pages, maxPages: settings.letterMaxPages },
    });
  }

  const years = context.positions.map(
    (position) => `${position.startDate ?? ""} ${position.endDate ?? ""}`
  );
  // What backs a paragraph's figures, as `assembleLetter` does: the
  // sources it cites (profile lines, the career direction, instructions);
  // a paragraph the user wrote by hand has no citations, so any measured
  // profile line and the instructions back it, as in a resume line without
  // a position.
  const figureSources = (line: CoverLetterContent["paragraphs"][number]) => {
    if (line.origin.kind !== "letter") {
      return [
        ...years,
        ...context.evidence.map((row) => row.figures),
        ...context.careerDirection.map((row) => row.text),
        ...context.instructions.map((row) => row.text),
        ...input.ownSources,
      ];
    }
    const { evidenceIds, instructionIds } = line.origin;
    return [
      ...years,
      ...context.evidence
        .filter((row) => evidenceIds.includes(row.id))
        .map((row) => row.figures),
      ...context.careerDirection
        .filter((row) => evidenceIds.includes(row.id))
        .map((row) => row.text),
      ...context.instructions
        .filter((row) => instructionIds.includes(row.id))
        .map((row) => row.text),
      ...input.ownSources,
    ];
  };
  for (const line of content.paragraphs) {
    if (!line.text.trim()) continue;
    const finding = (
      code: CoverageFindingCode,
      params: Record<string, string | number>
    ): CoverageFinding => ({
      code,
      lineId: line.id,
      positionId: null,
      text: line.text,
      params,
    });
    const placeholders = [
      ...(line.text.includes(withheld) ? [withheld] : []),
      ...findMarks(line.text).map((mark) =>
        line.text.slice(mark.from, mark.to)
      ),
    ];
    const figures = ungivenFigures(line.text, figureSources(line));
    if (placeholders.length || figures.length) {
      findings.push(
        finding("figure", { figures: [...placeholders, ...figures].join(", ") })
      );
    }
    const origin =
      line.origin.kind === "letter"
        ? line.origin
        : { evidenceIds: [] as string[], instructionIds: [] as string[] };
    for (const violation of letterViolations(
      line.text,
      context,
      origin.evidenceIds,
      origin.instructionIds
    )) {
      findings.push(finding(violation.code, violation.params));
    }
  }
  return findings;
}
