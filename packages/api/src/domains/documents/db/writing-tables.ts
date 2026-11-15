import { sql } from "drizzle-orm";
import { unique } from "drizzle-orm/pg-core";

import { careerProfilesTable } from "@repo/api/domains/career/db/career-tables";
import { createTable } from "@repo/api/utils/db/create-table";

import type { TemplateSection } from "../schemas/template";

/**
 * The user's global template: which sections their resume has, each with
 * optional conditions checked by code, and the header printed on every
 * document (the name on the resume, not the account name).
 */
export const resumeTemplatesTable = createTable(
  "resume_templates",
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
    sections: d.jsonb().$type<TemplateSection[]>().notNull(),
    // JSON of the resume header (name, contacts, city), encrypted.
    encryptedHeader: d.text(),
  }),
  (t) => [unique("resume_templates_profile_id_unique").on(t.profileId)]
);

/**
 * How the user writes, extracted from their samples (or their own words in
 * the evidence) and approved by them; it never carries facts or sentences.
 */
export const styleProfilesTable = createTable(
  "style_profiles",
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
    // JSON array of up to three writing samples, encrypted; empty means the
    // user's own words in the evidence serve as the sample.
    encryptedSamples: d.text().notNull(),
    // JSON of the extracted profile, encrypted; null until extracted.
    encryptedProfile: d.text(),
    approvedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [unique("style_profiles_profile_id_unique").on(t.profileId)]
);
