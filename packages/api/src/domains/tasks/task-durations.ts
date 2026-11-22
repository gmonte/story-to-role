import type { TaskType } from "./schemas/task";

/**
 * The longest a run of each task may take, in seconds (its Trigger.dev
 * `maxDuration`); the others take the project's default, set in
 * `trigger.config.ts`.
 */
export const taskMaxDuration = {
  analyze_opening: 600,
  research_company: 300,
  review_document: 300,
  adapt_document: 600,
  generate_document: 900,
} as const satisfies Partial<Record<TaskType, number>>;

export const defaultMaxDuration = 3600;

export const maxDurationOf = (type: TaskType): number =>
  (taskMaxDuration as Partial<Record<TaskType, number>>)[type] ??
  defaultMaxDuration;
