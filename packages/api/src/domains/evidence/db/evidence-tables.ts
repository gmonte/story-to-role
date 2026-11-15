import { sql } from "drizzle-orm";
import { index } from "drizzle-orm/pg-core";

import {
  careerProfilesTable,
  credentialsTable,
  positionsTable,
  projectsTable,
  sourceDocumentsTable,
} from "@repo/api/domains/career/db/career-tables";
import type { InterviewLanguage } from "@repo/api/domains/career/schemas/career";
import { createTable } from "@repo/api/utils/db/create-table";

import type {
  EvidenceKind,
  SensitiveItemKind,
  SensitivityChoice,
} from "../schemas/evidence";

/**
 * Approved facts: the only facts generation may use. Each keeps the exact
 * quote of the user's words or the document passage it came from, which
 * outlives the deleted transcript.
 */
export const evidenceTable = createTable(
  "evidence",
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
      .references(() => positionsTable.id, { onDelete: "cascade" }),
    credentialId: d
      .uuid()
      .references(() => credentialsTable.id, { onDelete: "cascade" }),
    projectId: d
      .uuid()
      .references(() => projectsTable.id, { onDelete: "set null" }),
    kind: d.text().$type<EvidenceKind>().notNull(),
    encryptedText: d.text().notNull(),
    language: d.text().$type<InterviewLanguage>().notNull(),
    encryptedSourceQuote: d.text().notNull(),
    // The turn is deleted 7 days after approval; its id stays for the trace.
    sourceTurnId: d.uuid(),
    sourceDocumentId: d
      .uuid()
      .references(() => sourceDocumentsTable.id, { onDelete: "set null" }),
    lowDetail: d.boolean().notNull().default(false),
    approvedAt: d.timestamp({ withTimezone: true }).notNull(),
  }),
  (t) => [
    index("evidence_profile_id_idx").on(t.profileId),
    index("evidence_position_id_idx").on(t.positionId),
  ]
);

/** Problem, action, partners and result: the raw material of bullets and letters. */
export const storiesTable = createTable(
  "stories",
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
    positionId: d
      .uuid()
      .references(() => positionsTable.id, { onDelete: "cascade" }),
    credentialId: d
      .uuid()
      .references(() => credentialsTable.id, { onDelete: "cascade" }),
    encryptedProblem: d.text().notNull(),
    encryptedAction: d.text().notNull(),
    encryptedPartners: d.text(),
    encryptedResult: d.text().notNull(),
    language: d.text().$type<InterviewLanguage>().notNull(),
    evidenceIds: d
      .uuid()
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    approvedAt: d.timestamp({ withTimezone: true }).notNull(),
  }),
  (t) => [index("stories_position_id_idx").on(t.positionId)]
);

/** A skill is usable only through the evidence that shows it. */
export const skillsTable = createTable(
  "skills",
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
    encryptedName: d.text().notNull(),
    evidenceIds: d
      .uuid()
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
  }),
  (t) => [index("skills_profile_id_idx").on(t.profileId)]
);

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
    choice: d.text().$type<SensitivityChoice>(),
    encryptedGeneralized: d.text(),
    reviewedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("sensitive_items_profile_id_idx").on(t.profileId)]
);
