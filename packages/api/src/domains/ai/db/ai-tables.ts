import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { tasksTable } from "@repo/api/domains/tasks/db/tasks-tables";
import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { createTable } from "@repo/api/utils/db/create-table";

import type { AiFunding } from "../ai-funding";
import type { AiKeyStatus } from "../schemas/ai-keys";
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

/**
 * A user's own provider key (guided interview spec, "AI providers"),
 * encrypted with the user's data key, so it follows the same envelope and
 * master-key rotation as their career content. Only its last characters
 * are ever shown again.
 */
export const aiKeysTable = createTable(
  "ai_keys",
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
    provider: d.text().$type<"anthropic">().notNull(),
    encryptedKey: d.text().notNull(),
    lastCharacters: d.text().notNull(),
    // Set when the provider refused the key or its credit ran out.
    status: d.text().$type<AiKeyStatus>().notNull().default("active"),
    statusChangedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [unique("ai_keys_user_id_provider_unique").on(t.userId, t.provider)]
);
