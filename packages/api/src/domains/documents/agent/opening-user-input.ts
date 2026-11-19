import { MotivationRepository } from "@repo/api/domains/applications/motivation/motivation-repository";
import { ResearchRepository } from "@repo/api/domains/applications/research/research-repository";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import { loadNeverIncludeFilter } from "@repo/api/domains/profile/rules/load-never-include-filter";
import type { DbClient } from "@repo/api/tools/db-client";

import type { CareerContext } from "../generation/load-career-context";

/**
 * What the person told or chose for one opening (the document agents'
 * context, ADR 0009): each gap question's answer (have or lack, their own
 * words, where it happened), the instructions they kept, and, for a cover
 * letter, the story they chose, the motivation points they kept and the
 * company facts they approved. Their statements, never verified facts.
 */
export type OpeningUserInput = {
  gapAnswers: Array<{
    requirement: string;
    lacks: boolean;
    answer: string | null;
    // The positions and projects the answer is tied to, by name.
    where: string[];
  }>;
  instructions: string[];
  story: string | null;
  motivation: string[];
  companyFacts: string[];
};

export async function loadOpeningUserInput(input: {
  db: DbClient;
  cipher: UserCipher;
  profileId: string;
  openingId: string;
  kind: "resume" | "cover_letter";
  career: CareerContext;
  storyLineId: string | null;
  // Before the letter exists: the motivation points not yet decided count.
  draftMotivation?: boolean;
}): Promise<OpeningUserInput> {
  const { db, cipher, career } = input;
  const filter = await loadNeverIncludeFilter({
    db,
    cipher,
    profileId: input.profileId,
  });
  const open = (value: string) => filter.apply(cipher.decrypt(value));

  const openings = new OpeningsRepository(db);
  const [fitCheck] = await openings.latestFitChecks([input.openingId]);
  const items = fitCheck ? await openings.listFitCheckItems(fitCheck.id) : [];
  const terms = new Map(
    (await openings.listTerms(input.openingId)).map((term) => [
      term.id,
      cipher.decrypt(term.encryptedText),
    ])
  );
  const positions = new Map(
    career.positions.map((position) => [
      position.id,
      `${position.title} at ${position.employer}`,
    ])
  );
  const projects = new Map(
    career.projects.map((project) => [project.id, `${project.name} (project)`])
  );
  const gapAnswers = items
    .filter(
      (item) =>
        item.encryptedGapAnswer !== null || item.lackConfirmedAt !== null
    )
    .map((item) => ({
      requirement: terms.get(item.termId) ?? "",
      lacks: !!item.lackConfirmedAt,
      answer: item.encryptedGapAnswer ? open(item.encryptedGapAnswer) : null,
      where: [
        ...(item.gapLinks?.positionIds ?? []).map((id) => positions.get(id)),
        ...(item.gapLinks?.projectIds ?? []).map((id) => projects.get(id)),
      ].filter((name): name is string => !!name),
    }));

  const letter = input.kind === "cover_letter";
  const story = letter
    ? (career.evidence.find((line) => line.id === input.storyLineId)?.text ??
      null)
    : null;
  let motivation: string[] = [];
  let companyFacts: string[] = [];
  if (letter) {
    const motivations = new MotivationRepository(db);
    const interview = await motivations.findInterviewByOpening(input.openingId);
    motivation = interview
      ? (await motivations.listPoints(interview.id))
          .filter(
            (point) =>
              point.status === "kept" ||
              point.status === "promoted" ||
              (input.draftMotivation && point.status === "draft")
          )
          .map((point) => open(point.encryptedText))
      : [];
    companyFacts = (await new ResearchRepository(db).listFacts(input.openingId))
      .filter((fact) => fact.approvedAt)
      .map((fact) => open(fact.encryptedText));
  }
  return {
    gapAnswers,
    instructions: career.instructions.map((point) => point.text),
    story: story && filter.apply(story),
    motivation,
    companyFacts,
  };
}

const shorten = (text: string, max = 400) => {
  const line = text.replace(/\s*\n\s*/g, " / ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** The input as lines of the agent's prompt, compact; empty when none. */
export function userInputLines(input: OpeningUserInput | null): string[] {
  if (!input) return [];
  return [
    ...input.gapAnswers.map(
      (gap) =>
        `- gap question “${gap.requirement}”: ${gap.lacks ? "the person says they do NOT have it" : "the person says they have it"}${gap.answer ? ` — “${shorten(gap.answer)}”` : ""}${gap.where.length ? ` (at: ${gap.where.join("; ")})` : ""}`
    ),
    ...input.instructions.map(
      (text) => `- application instruction: ${shorten(text)}`
    ),
    ...(input.story ? [`- chosen story: ${shorten(input.story)}`] : []),
    ...input.motivation.map((text) => `- motivation: ${shorten(text)}`),
    ...input.companyFacts.map(
      (text) => `- approved company fact: ${shorten(text)}`
    ),
  ];
}
