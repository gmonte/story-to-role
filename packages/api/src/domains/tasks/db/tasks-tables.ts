import { sql } from "drizzle-orm";
import { index } from "drizzle-orm/pg-core";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import type { AiFunding } from "@repo/api/domains/ai/ai-funding";
import { createTable } from "@repo/api/utils/db/create-table";
import type {
  DocumentKind,
  GenerationKind,
} from "@repo/api/domains/documents/schemas/document";

import type { TaskProgress, TaskStatus, TaskType } from "../schemas/task";

/**
 * Every AI or background job (ADR 0003). The Trigger.dev run receives only
 * this row's id and loads everything else from the database, so no content
 * reaches Trigger.dev's logs; `runId` lets the browser follow the run through
 * Realtime. Rows hold no career content either: results land in the domain's
 * own tables.
 */
export const tasksTable = createTable(
  "tasks",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),

    userId: d
      .uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: d.text().$type<TaskType>().notNull(),
    // The row the task works on (a chat message, an import…), so the run
    // can load it from the task id alone.
    subjectId: d.uuid(),
    // Parallel reviewers a review task runs (1 or 3), read by the run.
    reviewers: d.integer().notNull().default(1),
    // A document operation's kinds, kept when the task is created so the
    // usage statement still names it after the document is deleted (which
    // deletes the generation the subject points to).
    documentKind: d.text().$type<DocumentKind>(),
    generationKind: d.text().$type<GenerationKind>(),
    status: d.text().$type<TaskStatus>().notNull().default("pending"),
    runId: d.text(),
    progress: d.jsonb().$type<TaskProgress>(),
    errorMessage: d.text(),
    // Who pays for the task's AI calls, decided when it starts.
    funding: d.text().$type<AiFunding>().notNull().default("credits"),
    startedAt: d.timestamp({ withTimezone: true }),
    finishedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("tasks_user_id_idx").on(t.userId),
    index("tasks_run_id_idx").on(t.runId),
  ]
);
