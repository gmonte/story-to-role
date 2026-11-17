import { sql } from "drizzle-orm";
import { index } from "drizzle-orm/pg-core";

import {
  careerProfilesTable,
  positionsTable,
} from "@repo/api/domains/career/db/career-tables";
import type { InterviewLanguage } from "@repo/api/domains/career/schemas/career";
import { createTable } from "@repo/api/utils/db/create-table";

import type { SensitiveItemKind, SensitivityChoice } from "../schemas/evidence";

/**
 * A client, codename, figure or person the user may not want in generated
 * text. `choice` stays null until the user reviews it.
 */
export const sensitiveItemsTable = createTable(
  "sensitive_items",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
    profileId: d
      .uuid()
      .notNull()
      .references(() => careerProfilesTable.id, { onDelete: "cascade" }),
    positionId: d
      .uuid()
      .references(() => positionsTable.id, { onDelete: "set null" }),
    kind: d.text().$type<SensitiveItemKind>().notNull(),
    encryptedOriginal: d.text().notNull(),
    // The passage it appears in, so the user knows what it is ("R$ 18.000"
    // alone says nothing).
    encryptedContext: d.text(),
    choice: d.text().$type<SensitivityChoice>(),
    encryptedGeneralized: d.text(),
    reviewedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("sensitive_items_profile_id_idx").on(t.profileId)]
);

/**
 * What the user wants from their next role (guided-interview spec, data
 * model): approved from motivation interview points, reused by later cover
 * letters so they ask less.
 */
export const careerGoalsTable = createTable(
  "career_goals",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    profileId: d
      .uuid()
      .notNull()
      .references(() => careerProfilesTable.id, { onDelete: "cascade" }),
    encryptedText: d.text().notNull(),
    language: d.text().$type<InterviewLanguage>().notNull(),
    // Where it came from (data model: a motivation interview turn or an
    // application instruction) and that point's id.
    source: d
      .text()
      .$type<"motivation_interview" | "application_instruction">()
      .notNull(),
    sourcePointId: d.uuid(),
    approvedAt: d.timestamp({ withTimezone: true }).notNull(),
  }),
  (t) => [index("career_goals_profile_id_idx").on(t.profileId)]
);
