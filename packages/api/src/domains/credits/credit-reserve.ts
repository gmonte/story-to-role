import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { TaskType } from "@repo/api/domains/tasks/schemas/task";
import type { DbClient } from "@repo/api/tools/db-client";

import { creditCap } from "./credit-pricing";
import { CreditsRepository } from "./credits-repository";

/** What a resume may cost the user at the defaults (Quick, standard level). */
export async function resumeEstimate(db: DbClient, userId: string) {
  const profile = await new CareerRepository(db).findProfileByUserId(userId);
  const positions = profile
    ? (await new CareerRepository(db).listPositions(profile.id)).filter(
        (position) => position.status === "approved"
      ).length
    : 0;
  return creditCap("generate_document", { positions });
}

/**
 * The credit reserve (billing spec, "Credit meter"): in the Free plan,
 * enough credits for the resume the user came for, kept until they have
 * one. A paid plan (a courtesy grant, for now) keeps nothing.
 */
export async function creditReserve(db: DbClient, userId: string, now: Date) {
  const repository = new CreditsRepository(db);
  if (await repository.activeCourtesy(userId, now)) return 0;
  const profile = await new CareerRepository(db).findProfileByUserId(userId);
  if (profile && (await repository.hasResume(profile.id))) return 0;
  return resumeEstimate(db, userId);
}

/** Only the interview may never spend what the reserve keeps. */
export const keepsReserve = (type: TaskType) => type === "interview_turn";

// Within this many interview turns of the reserve, the interviewer wraps up.
const wrapUpTurns = 5;

/**
 * Whether the balance approaches the reserve: the interviewer is then told
 * to wrap up the current position with what was said.
 */
export async function nearReserve(
  db: DbClient,
  input: { userId: string; available: number; now: Date }
) {
  const reserve = await creditReserve(db, input.userId, input.now);
  return (
    reserve > 0 &&
    input.available - reserve < wrapUpTurns * creditCap("interview_turn")
  );
}
