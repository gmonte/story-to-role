import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { ProfileRepository } from "@repo/api/domains/profile/profile-repository";
import type { TaskType } from "@repo/api/domains/tasks/schemas/task";
import type { DbClient } from "@repo/api/tools/db-client";

import { spendableTotal } from "./credit-ledger";
import { currentPlan } from "./credit-plan";
import { creditCap } from "./credit-pricing";
import { CreditsRepository } from "./credits-repository";

/**
 * The user's career profile and how many positions their published profile
 * has, which size a resume. Undefined until one is published: the estimate
 * then assumes a usual career.
 */
async function careerSize(db: DbClient, userId: string) {
  const profile = await new CareerRepository(db).findProfileByUserId(userId);
  const profiles = new ProfileRepository(db);
  const document = await profiles.findDocument(userId, "profile");
  const positions = document?.publishedVersionId
    ? await profiles.countExperiences(document.publishedVersionId)
    : undefined;
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

/**
 * Working on the profile never spends what the reserve keeps (billing
 * spec, "Credit meter"): the agents' messages, validation and imports.
 */
export const keepsReserve = (type: TaskType) =>
  type === "profile_agent_turn" ||
  type === "document_agent_turn" ||
  type === "validate_profile" ||
  type === "import_document";

// Within this many agent messages of the reserve, the balance is near it.
const wrapUpTurns = 5;

/** Whether the balance approaches the reserve (the credit meter warns). */
export async function nearReserve(db: DbClient, userId: string, now: Date) {
  const reserve = await creditReserve(db, userId, now);
  if (reserve === 0) return false;
  const available = await spendableTotal(db, userId, "any", now);
  return available - reserve < wrapUpTurns * creditCap("profile_agent_turn");
}
