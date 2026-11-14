import { sql } from "drizzle-orm";
import { index } from "drizzle-orm/pg-core";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { createTable } from "@repo/api/utils/db/create-table";

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
    status: d.text().$type<TaskStatus>().notNull().default("pending"),
    runId: d.text(),
    progress: d.jsonb().$type<TaskProgress>(),
    errorMessage: d.text(),
    startedAt: d.timestamp({ withTimezone: true }),
    finishedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("tasks_user_id_idx").on(t.userId),
    index("tasks_run_id_idx").on(t.runId),
  ]
);
