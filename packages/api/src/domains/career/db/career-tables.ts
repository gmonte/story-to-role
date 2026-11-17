import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { createTable } from "@repo/api/utils/db/create-table";

import type {
  InterviewLanguage,
  CredentialKind,
  CredentialStatus,
  PositionOrigin,
  PositionStatus,
  SourceDocumentKind,
  SourceImportRejection,
  SourceImportStatus,
  StartPath,
} from "../schemas/career";

// Every `encrypted*` column holds ciphertext from the user's data key
// (privacy spec): a database copy reveals no career content.

const timestamps = (d: Parameters<Parameters<typeof createTable>[1]>[0]) => ({
  createdAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
});

/** One per user: the anchor of everything career-related. */
export const careerProfilesTable = createTable(
  "career_profiles",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    ...timestamps(d),
    userId: d
      .uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    interviewLanguage: d.text().$type<InterviewLanguage>().notNull(),
    privacyNoticeAcceptedAt: d.timestamp({ withTimezone: true }),
    // How the user chose to start (workspace spec, "Onboarding").
    startPath: d.text().$type<StartPath>(),
  }),
  (t) => [unique("career_profiles_user_id_unique").on(t.userId)]
);

/** A source file the user uploaded (resume, LinkedIn PDF, truth file). */
export const sourceDocumentsTable = createTable(
  "source_documents",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    ...timestamps(d),
    profileId: d
      .uuid()
      .notNull()
      .references(() => careerProfilesTable.id, { onDelete: "cascade" }),
    kind: d.text().$type<SourceDocumentKind>().notNull(),
    encryptedFileName: d.text().notNull(),
    mimeType: d.text().notNull(),
    storageKey: d.text().notNull(),
    encryptedText: d.text(),
    // Reading the file into profile suggestions (profile spec, "Importing a
    // resume"): null until an import starts.
    importStatus: d.text().$type<SourceImportStatus>(),
    importRejection: d.text().$type<SourceImportRejection>(),
    // What the agent says when the import ends: what was proposed and what
    // is still missing; said once in the chat.
    encryptedImportSummary: d.text(),
    importSummarySaidAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("source_documents_profile_id_idx").on(t.profileId)]
);

/**
 * A role at one employer. Employer, title and dates are locked facts once
 * approved; removal is soft so the position can come back.
 */
export const positionsTable = createTable(
  "positions",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    ...timestamps(d),
    profileId: d
      .uuid()
      .notNull()
      .references(() => careerProfilesTable.id, { onDelete: "cascade" }),
    encryptedEmployer: d.text().notNull(),
    encryptedTitle: d.text().notNull(),
    encryptedLocation: d.text(),
    // YYYY-MM; a null end date means the user still holds the position.
    startDate: d.text(),
    endDate: d.text(),
    status: d.text().$type<PositionStatus>().notNull().default("pending"),
    origin: d.text().$type<PositionOrigin>().notNull(),
    sourceDocumentIds: d
      .uuid()
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    approvedAt: d.timestamp({ withTimezone: true }),
    removedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("positions_profile_id_idx").on(t.profileId)]
);

/** Education, certifications, languages…: short locked facts. */
export const credentialsTable = createTable(
  "credentials",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    ...timestamps(d),
    profileId: d
      .uuid()
      .notNull()
      .references(() => careerProfilesTable.id, { onDelete: "cascade" }),
    kind: d.text().$type<CredentialKind>().notNull(),
    encryptedInstitution: d.text(),
    encryptedTitle: d.text().notNull(),
    level: d.text(),
    startDate: d.text(),
    endDate: d.text(),
    status: d.text().$type<CredentialStatus>().notNull().default("completed"),
    sourceDocumentIds: d
      .uuid()
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    approvedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("credentials_profile_id_idx").on(t.profileId)]
);
