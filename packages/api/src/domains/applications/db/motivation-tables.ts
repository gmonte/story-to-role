import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { careerProfilesTable } from "@repo/api/domains/career/db/career-tables";
import { storiesTable } from "@repo/api/domains/evidence/db/evidence-tables";
import { openingsTable } from "@repo/api/domains/openings/db/openings-tables";
import { createTable } from "@repo/api/utils/db/create-table";

import type {
  MotivationPointKind,
  MotivationPointStatus,
  MotivationStatus,
  MotivationTurnRole,
} from "../schemas/motivation";

const createdAt = (d: Parameters<Parameters<typeof createTable>[1]>[0]) =>
  d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull();

/**
 * The motivation interview of an opening (resume spec, "Cover letter
 * inputs"), with the story the letter will tell. Keyed by opening, like the
 * other cover letter inputs.
 */
export const motivationInterviewsTable = createTable(
  "motivation_interviews",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: createdAt(d),
    profileId: d
      .uuid()
      .notNull()
      .references(() => careerProfilesTable.id, { onDelete: "cascade" }),
    openingId: d
      .uuid()
      .notNull()
      .references(() => openingsTable.id, { onDelete: "cascade" }),
    status: d.text().$type<MotivationStatus>().notNull().default("in_progress"),
    storyId: d
      .uuid()
      .references(() => storiesTable.id, { onDelete: "set null" }),
  }),
  (t) => [unique("motivation_interviews_opening_unique").on(t.openingId)]
);

export const motivationTurnsTable = createTable(
  "motivation_turns",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: createdAt(d),
    interviewId: d
      .uuid()
      .notNull()
      .references(() => motivationInterviewsTable.id, { onDelete: "cascade" }),
    sequence: d.integer().notNull(),
    role: d.text().$type<MotivationTurnRole>().notNull(),
    encryptedText: d.text().notNull(),
    aboutStory: d.boolean().notNull().default(false),
  }),
  (t) => [
    unique("motivation_turns_sequence_unique").on(t.interviewId, t.sequence),
  ]
);

/** A point of the answers, in the user's words, and where it went. */
export const motivationPointsTable = createTable(
  "motivation_points",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: createdAt(d),
    profileId: d
      .uuid()
      .notNull()
      .references(() => careerProfilesTable.id, { onDelete: "cascade" }),
    interviewId: d
      .uuid()
      .notNull()
      .references(() => motivationInterviewsTable.id, { onDelete: "cascade" }),
    kind: d.text().$type<MotivationPointKind>().notNull(),
    encryptedText: d.text().notNull(),
    suggested: d.boolean().notNull().default(false),
    // Names and figures flagged in a story detail, for the sensitive review.
    encryptedSensitiveItems: d.text(),
    status: d.text().$type<MotivationPointStatus>().notNull().default("draft"),
  }),
  (t) => [index("motivation_points_interview_id_idx").on(t.interviewId)]
);
