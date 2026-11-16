import type { TaskProgress } from "./schemas/task";

/**
 * A task's narrator: reports each of its steps by key, with counts, as
 * Realtime metadata. Keys and numbers only: the metadata lives on
 * Trigger.dev, so career content never goes in.
 */
export function createNarrator<const TStep extends string>(
  steps: readonly TStep[],
  reportProgress?: (progress: TaskProgress) => Promise<void>
) {
  return (step: TStep, counts?: Record<string, number>) =>
    reportProgress?.({
      step: steps.indexOf(step) + 1,
      totalSteps: steps.length,
      label: step,
      counts,
    });
}
