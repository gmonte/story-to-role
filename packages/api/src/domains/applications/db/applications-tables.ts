import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { careerProfilesTable } from "@repo/api/domains/career/db/career-tables";
import type { ResumeSectionKind } from "@repo/api/domains/documents/schemas/resume-content";
import { openingsTable } from "@repo/api/domains/openings/db/openings-tables";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
import { createTable } from "@repo/api/utils/db/create-table";

import type {
  ApplicationSource,
  ApplicationStatus,
} from "../schemas/application";

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
    // The method's tracker fields (tracker spec). The structured ones may
    // reach a prompt; the free text (all encrypted) never does.
    source: d.text().$type<ApplicationSource>(),
    encryptedSourceDetail: d.text(),
    // The resume the user says an external application was sent with: a
    // resume version picked by hand. Applications sent from StoryToRole
    // read it from their submissions instead.
    // No foreign key (documents' tables already point here); a deleted
    // version simply stops resolving.
    pickedResumeVersionId: d.uuid(),
    encryptedNextStep: d.text(),
    encryptedNotes: d.text(),
    encryptedDeclineReason: d.text(),
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
