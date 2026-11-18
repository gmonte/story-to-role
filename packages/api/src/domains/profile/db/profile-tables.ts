import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { createTable } from "@repo/api/utils/db/create-table";
import { embeddingDimensions } from "@repo/api/tools/embeddings/embedding-model";

import type { PassageKind } from "../truth/extract";
import type {
  ProfileDocumentKind,
  ProfileSuggestionOrigin,
  ProfileSuggestionStatus,
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
    // When the draft got the empty “occasional experience” level line (once,
    // so a user who deletes it does not get it back); null until then.
    occasionalLevelAddedAt: d.timestamp({ withTimezone: true }),
    // Keys of the content findings the user chose to ignore (see
    // `findingKey`); editing the finding's line brings it back.
    dismissedFindings: d.jsonb().$type<string[]>().notNull().default([]),
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
    // Only "evidence" counts as coverage; the others say what is lacking.
    kind: d.text().$type<PassageKind>().notNull().default("evidence"),
    section: d.text(),
    experience: d.integer(),
    encryptedText: d.text().notNull(),
    embedding: d.vector({ dimensions: embeddingDimensions }),
  }),
  (t) => [index("profile_passages_version_id_idx").on(t.versionId)]
);

/**
 * A change proposed to a document's draft (profile spec, "Suggestions"):
 * pending until the user accepts or rejects it in the text. Its content is
 * a ProfileChange and the reason shown with it, as JSON.
 */
export const profileSuggestionsTable = createTable(
  "profile_suggestions",
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
    origin: d.text().$type<ProfileSuggestionOrigin>().notNull(),
    status: d
      .text()
      .$type<ProfileSuggestionStatus>()
      .notNull()
      .default("pending"),
    encryptedContent: d.text().notNull(),
    resolvedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("profile_suggestions_document_status_idx").on(t.documentId, t.status),
  ]
);

/**
 * A user's conversation with the profile agent (ADR 0007). Its id is the
 * chat id the Trigger.dev session is keyed on; the agent finds the user
 * through this row, never through what the browser sends. A new row starts
 * once the session behind the current one expires.
 */
export const profileChatsTable = createTable(
  "profile_chats",
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
    // The chat runtime's opaque state and stream cursors (no career content).
    encryptedState: d.text(),
    lastOutEventId: d.text(),
    lastInEventId: d.text(),
    // The session's retention deadline on Trigger.dev.
    expiresAt: d.timestamp({ withTimezone: true }).notNull(),
  }),
  (t) => [index("profile_chats_user_id_idx").on(t.userId)]
);

/**
 * The conversation's messages, in order, each a UI message encrypted with
 * the user's data key; purged 7 days after they were written.
 */
export const profileChatMessagesTable = createTable(
  "profile_chat_messages",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    chatId: d
      .uuid()
      .notNull()
      .references(() => profileChatsTable.id, { onDelete: "cascade" }),
    // The UI message's own id, as the chat runtime addresses it.
    messageId: d.text().notNull(),
    position: d.integer().notNull(),
    encryptedMessage: d.text().notNull(),
    // An answer cut short (a stop or a crash) stays marked across a resume.
    final: d.boolean().notNull().default(true),
  }),
  (t) => [
    unique("profile_chat_messages_chat_message_unique").on(
      t.chatId,
      t.messageId
    ),
    index("profile_chat_messages_chat_position_idx").on(t.chatId, t.position),
  ]
);
