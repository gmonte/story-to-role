import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadSensitiveFilter } from "@repo/api/domains/evidence/sensitive/load-sensitive-filter";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import { ProfileRepository } from "@repo/api/domains/profile/profile-repository";
import { mentions } from "@repo/api/domains/profile/truth/lint";
import type { DbClient } from "@repo/api/tools/db-client";

import { loadCareerContext } from "../generation/load-career-context";
import { withheld } from "../generation/profile-source";
import { loadOpeningBrief } from "../generation/run-generate-resume";

/** How many stories are offered (resume spec, "Story choice"). */
export const offeredStories = 3;

export type LetterStory = {
  // The profile line, by its id in the version published now.
  lineId: string;
  text: string;
  position: {
    positionId: string;
    employer: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
  } | null;
  // The opening's requirements this story answers: the fit check's, then
  // those its words name.
  fits: string[];
};

/**
 * The stories the profile's experiences tell (the results lines are the
 * natural ones: a challenge, the user's choice and its outcome), ranked by
 * similarity to the opening, top three (resume spec, "Cover letter
 * inputs": "Story choice"). Similarity is that of the profile's embedded
 * passages to the opening's vector; where a passage has none yet, stories
 * keep the profile's order, most recent position first. Only the profile
 * published now, with its communication rules applied.
 */
export async function rankStories(input: {
  db: DbClient;
  cipher: UserCipher;
  profileId: string;
  openingId: string;
}): Promise<LetterStory[]> {
  const { db, cipher } = input;
  const filter = await loadSensitiveFilter({
    db,
    cipher,
    profileId: input.profileId,
  });
  const context = await loadCareerContext({
    db,
    cipher,
    profileId: input.profileId,
    filter,
  });
  if (!context.profileVersionId) return [];
  // A result whose figure can't be told is no story to lead a letter.
  const stories = context.evidence.filter(
    (line) =>
      line.kind === "achievement" &&
      line.positionId &&
      !line.text.includes(withheld)
  );
  if (stories.length === 0) return [];

  const opening = await new OpeningsRepository(db).findOpeningById(
    input.openingId
  );
  const nearest = opening?.embedding
    ? await new ProfileRepository(db).nearestEvidencePassages({
        versionId: context.profileVersionId,
        embedding: opening.embedding,
        limit: 60,
      })
    : [];
  const rankOf = new Map(nearest.map((row, index) => [row.id, index]));
  const passageOf = new Map(
    [...context.evidenceOfPassage].flatMap(([passageId, lineIds]) =>
      lineIds.map((lineId) => [lineId, passageId] as const)
    )
  );
  const brief = await loadOpeningBrief({
    db,
    cipher,
    openingId: input.openingId,
    evidenceOfPassage: context.evidenceOfPassage,
  });

  const ranked = stories
    .map((line, order) => ({
      line,
      order,
      rank: rankOf.get(passageOf.get(line.id) ?? "") ?? Infinity,
    }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, offeredStories);
  return ranked.map(({ line }) => {
    const position = context.positions.find(
      (row) => row.id === line.positionId
    );
    const fits = [
      ...brief.fitCheck
        .filter(
          (item) => item.verdict !== "gap" && item.evidenceIds.includes(line.id)
        )
        .map((item) => item.term),
      ...brief.terms
        .filter((term) => mentions(line.text, term.text))
        .map((term) => term.text),
    ];
    return {
      lineId: line.id,
      // As the user wrote it, without the field's label.
      text: line.text.replace(/^[^:]{1,40}:\s*/, ""),
      position: position
        ? {
            positionId: position.id,
            employer: position.employer,
            title: position.title,
            startDate: position.startDate,
            endDate: position.endDate,
          }
        : null,
      fits: [...new Set(fits)].slice(0, 3),
    };
  });
}
