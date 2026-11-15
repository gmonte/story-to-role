import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { TaskType } from "@repo/api/domains/tasks/schemas/task";
import type { DbClient } from "@repo/api/tools/db-client";

import { spendableTotal } from "./credit-ledger";
import { currentPlan } from "./credit-plan";
import { creditCap } from "./credit-pricing";
import { CreditsRepository } from "./credits-repository";

/** The user's profile and its approved positions, which size a resume. */
async function careerSize(db: DbClient, userId: string) {
  const career = new CareerRepository(db);
  const profile = await career.findProfileByUserId(userId);
  const positions = profile
    ? (await career.listPositions(profile.id)).filter(
        (position) => position.status === "approved"
      ).length
    : 0;
  return { profile, positions };
}

/**
 * What a resume may cost the user: at Quick and the standard level
 * (`base`), and at their usual choices (their last resume's).
 */
export async function resumeEstimate(db: DbClient, userId: string) {
  const { profile, positions } = await careerSize(db, userId);
  const usual = profile
    ? await new CreditsRepository(db).lastResumeChoices(profile.id)
    : null;
  return {
    base: creditCap("generate_document", { positions }),
    usual: creditCap("generate_document", {
      positions,
      thorough: usual?.reviewDepth === "thorough",
      maximum: usual?.writingLevel === "maximum",
    }),
  };
}

/**
 * The credit reserve (billing spec, "Credit meter"): in the Free plan,
 * enough credits for the resume the user came for, kept until they have
 * one. A paid plan keeps nothing.
 */
export async function creditReserve(db: DbClient, userId: string, now: Date) {
  if ((await currentPlan(db, userId, now)).kind !== "free") return 0;
  const repository = new CreditsRepository(db);
  const { profile, positions } = await careerSize(db, userId);
  if (profile && (await repository.hasResume(profile.id))) return 0;
  return creditCap("generate_document", { positions });
}

/** Only the interview may never spend what the reserve keeps. */
export const keepsReserve = (type: TaskType) => type === "interview_turn";

// Within this many interview turns of the reserve, the interviewer wraps up.
const wrapUpTurns = 5;

/**
 * Whether the balance approaches the reserve: the interviewer is then told
 * to wrap up the current position with what was said.
 */
export async function nearReserve(db: DbClient, userId: string, now: Date) {
  const reserve = await creditReserve(db, userId, now);
  if (reserve === 0) return false;
  const available = await spendableTotal(db, userId, "any", now);
  return available - reserve < wrapUpTurns * creditCap("interview_turn");
}
