import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { careerProfilesTable } from "@repo/api/domains/career/db/career-tables";
import type { ResumeSectionKind } from "@repo/api/domains/documents/schemas/resume-content";
import { openingsTable } from "@repo/api/domains/openings/db/openings-tables";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
import { createTable } from "@repo/api/utils/db/create-table";

import type { ApplicationStatus } from "../schemas/application";

/**
 * The user's pursuit of one opening: it starts when the opening's first
 * document is generated or copied (resume spec, "Flow").
 */
export const applicationsTable = createTable(
  "applications",
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
    openingId: d
      .uuid()
      .notNull()
      .references(() => openingsTable.id, { onDelete: "cascade" }),
    status: d
      .text()
      .$type<ApplicationStatus>()
      .notNull()
      .default("in_preparation"),
    tone: d.text().$type<Tone>().notNull().default("your_style"),
    // Registered by hand for an opening applied to outside StoryToRole
    // (tracker spec); it stops being external with its first document.
    external: d.boolean().notNull().default(false),
    statusChangedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    // The last thing that happened (a status change or an event): "No
    // response" counts from it.
    lastActivityAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    appliedAt: d.timestamp({ withTimezone: true }),
    // Sections forced in or out for this application only.
    sectionsForcedIn: d
      .text()
      .array()
      .$type<ResumeSectionKind[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    sectionsForcedOut: d
      .text()
      .array()
      .$type<ResumeSectionKind[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
  }),
  (t) => [
    unique("applications_opening_id_unique").on(t.openingId),
    index("applications_profile_id_idx").on(t.profileId),
  ]
);
