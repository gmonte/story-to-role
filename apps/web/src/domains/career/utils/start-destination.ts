import type { StartPath } from "@repo/api/domains/career/schemas/career";

/**
 * Where a user goes from the start screen (workspace spec, "Onboarding"):
 * the guided opening path resumes until its first opening exists; anyone
 * else who chose, or already has something, goes to My career. Null: they
 * still have to choose.
 */
export function startDestination(state: {
  path: StartPath | null;
  hasStarted: boolean;
  hasOpening: boolean;
}) {
  if (state.path === "opening" && !state.hasOpening)
    return "/app/start/opening";
  if (state.path ?? state.hasStarted) return "/app/career";
  return null;
}
