import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { createTable } from "@repo/api/utils/db/create-table";

import type { ProfileDocumentKind } from "../schemas/profile";

// Every `encrypted*` column holds ciphertext from the user's data key
// (privacy spec): a database copy reveals no career content.

/**
 * One per user and kind (the profile, and from P5 the job preferences): the
 * draft being edited and the version that is official.
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
