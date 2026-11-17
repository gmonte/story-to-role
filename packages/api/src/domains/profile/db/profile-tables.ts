import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { createTable } from "@repo/api/utils/db/create-table";
import { embeddingDimensions } from "@repo/api/tools/embeddings/embedding-model";

import type {
  ProfileDocumentKind,
  ProfileValidationStatus,
} from "../schemas/profile";

// Every `encrypted*` column holds ciphertext from the user's data key
// (privacy spec): a database copy reveals no career content.

/**
 * One per user and kind (the profile, and from P5 the job preferences): the
 * draft being edited and the published version the product reads.
 */
export const profileDocumentsTable = createTable(
  "profile_documents",
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
    kind: d.text().$type<ProfileDocumentKind>().notNull(),
    encryptedDraft: d.text().notNull(),
    draftUpdatedAt: d.timestamp({ withTimezone: true }).notNull(),
    // Bumped on every save, so a stale tab can't overwrite a newer draft.
    draftRevision: d.integer().notNull().default(0),
    publishedVersionId: d.uuid(),
  }),
  (t) => [unique("profile_documents_user_kind_unique").on(t.userId, t.kind)]
);

/** A published version: immutable, numbered from 1 per document. */
export const profileVersionsTable = createTable(
  "profile_versions",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    documentId: d
      .uuid()
      .notNull()
      .references(() => profileDocumentsTable.id, { onDelete: "cascade" }),
    number: d.integer().notNull(),
    encryptedMarkdown: d.text().notNull(),
    publishedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    validatedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    unique("profile_versions_document_number_unique").on(
      t.documentId,
      t.number
    ),
    index("profile_versions_document_id_idx").on(t.documentId),
  ]
);

/**
 * An AI quality review of what changed in the draft (profile spec,
 * "Validate and publish"): its report waits for the user, the last one per
 * document is what the editor shows.
 */
export const profileValidationsTable = createTable(
  "profile_validations",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    documentId: d
      .uuid()
      .notNull()
      .references(() => profileDocumentsTable.id, { onDelete: "cascade" }),
    // The draft revision reviewed, and the version it was compared with.
    draftRevision: d.integer().notNull(),
    baseVersionId: d.uuid(),
    status: d.text().$type<ProfileValidationStatus>().notNull(),
    // The report (findings and competency levels), as JSON.
    encryptedReport: d.text(),
    completedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("profile_validations_document_id_idx").on(t.documentId)]
);

/** The structure of a published version, as JSON (ProfileExtract). */
export const profileExtractsTable = createTable("profile_extracts", (d) => ({
  versionId: d
    .uuid()
    .primaryKey()
    .references(() => profileVersionsTable.id, { onDelete: "cascade" }),
  encryptedContent: d.text().notNull(),
}));

/** A passage of a published version and its local vector (ADR 0004). */
export const profilePassagesTable = createTable(
  "profile_passages",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    versionId: d
      .uuid()
      .notNull()
      .references(() => profileVersionsTable.id, { onDelete: "cascade" }),
    ordinal: d.integer().notNull(),
    section: d.text(),
    experience: d.integer(),
    encryptedText: d.text().notNull(),
    embedding: d.vector({ dimensions: embeddingDimensions }),
  }),
  (t) => [index("profile_passages_version_id_idx").on(t.versionId)]
);
