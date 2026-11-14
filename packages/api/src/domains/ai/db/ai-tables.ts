import { sql } from "drizzle-orm";
import { index } from "drizzle-orm/pg-core";

import { tasksTable } from "@repo/api/domains/tasks/db/tasks-tables";
import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { createTable } from "@repo/api/utils/db/create-table";

import type { AiFunding } from "../ai-funding";
import type { AiRole } from "../providers/provider-package";

/**
 * One row per AI call, with its token usage: what credit settlement and
 * bring-your-own-key cost estimates are computed from. No content.
 */
export const aiUsageTable = createTable(
  "ai_usage",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),

    userId: d
      .uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    taskId: d.uuid().references(() => tasksTable.id, { onDelete: "set null" }),
    // What the call was for, such as `topic_gate`.
    purpose: d.text().notNull(),
    funding: d.text().$type<AiFunding>().notNull(),
    provider: d.text().notNull(),
    role: d.text().$type<AiRole>().notNull(),
    model: d.text().notNull(),
    inputTokens: d.integer().notNull(),
    outputTokens: d.integer().notNull(),
    cacheReadTokens: d.integer().notNull().default(0),
    cacheWriteTokens: d.integer().notNull().default(0),
  }),
  (t) => [
    index("ai_usage_user_id_idx").on(t.userId),
    index("ai_usage_task_id_idx").on(t.taskId),
  ]
);
