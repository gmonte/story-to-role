import { sql } from "drizzle-orm";
import { index } from "drizzle-orm/pg-core";

import { careerProfilesTable } from "@repo/api/domains/career/db/career-tables";
import { openingsTable } from "@repo/api/domains/openings/db/openings-tables";
import { createTable } from "@repo/api/utils/db/create-table";

import type { ResearchStatus } from "../schemas/research";

/**
 * One company research run for an opening (resume spec, "Cover letter
 * inputs"). Keyed by opening, like the instructions: the application may
 * start only later, with its first document.
 */
export const companyResearchTable = createTable(
  "company_research",
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
    openingId: d
      .uuid()
      .notNull()
      .references(() => openingsTable.id, { onDelete: "cascade" }),
    status: d.text().$type<ResearchStatus>().notNull().default("researching"),
  }),
  (t) => [index("company_research_opening_id_idx").on(t.openingId)]
);

/**
 * A fact about the company with the page it came from. Only facts the user
 * approved enter a cover letter's context, like approved evidence.
 */
export const companyFactsTable = createTable(
  "company_facts",
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
    openingId: d
      .uuid()
      .notNull()
      .references(() => openingsTable.id, { onDelete: "cascade" }),
    researchId: d
      .uuid()
      .references(() => companyResearchTable.id, { onDelete: "set null" }),
    encryptedText: d.text().notNull(),
    encryptedSourceUrl: d.text().notNull(),
    encryptedSourceTitle: d.text().notNull(),
    approvedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("company_facts_opening_id_idx").on(t.openingId)]
);
