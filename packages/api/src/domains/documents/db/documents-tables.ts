import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { applicationsTable } from "@repo/api/domains/applications/db/applications-tables";
import { careerProfilesTable } from "@repo/api/domains/career/db/career-tables";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
import { createTable } from "@repo/api/utils/db/create-table";

import type {
  DocumentKind,
  GenerationStatus,
  OutputLanguage,
  ReviewDepth,
  SnapshotAuthor,
  SnapshotOrigin,
  WritingLevel,
} from "../schemas/document";

const createdAt = (d: Parameters<Parameters<typeof createTable>[1]>[0]) =>
  d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull();

/**
 * A resume or a cover letter: of one application (at most one of each) or
 * kept in the library, where its focus is its title.
 */
export const documentsTable = createTable(
  "documents",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: createdAt(d),
    profileId: d
      .uuid()
      .notNull()
      .references(() => careerProfilesTable.id, { onDelete: "cascade" }),
    applicationId: d
      .uuid()
      .references(() => applicationsTable.id, { onDelete: "cascade" }),
    kind: d.text().$type<DocumentKind>().notNull(),
    encryptedFocus: d.text(),
  }),
  (t) => [
    unique("documents_application_kind_unique").on(t.applicationId, t.kind),
    index("documents_profile_id_idx").on(t.profileId),
  ]
);

/**
 * The line of snapshots of a document in one output language (a git
 * branch). Adapted versions remember where they came from for language sync.
 */
export const documentVersionsTable = createTable(
  "document_versions",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: createdAt(d),
    documentId: d
      .uuid()
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    language: d.text().$type<OutputLanguage>().notNull(),
    encryptedLabel: d.text(),
    adaptedFromVersionId: d.uuid(),
    syncBaseSnapshotId: d.uuid(),
  }),
  (t) => [index("document_versions_document_id_idx").on(t.documentId)]
);

/**
 * An immutable copy of a version's structured content (a git commit). The
 * latest one of each version is the official one; undo deletes the latest.
 */
export const documentSnapshotsTable = createTable(
  "document_snapshots",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: createdAt(d),
    versionId: d
      .uuid()
      .notNull()
      .references(() => documentVersionsTable.id, { onDelete: "cascade" }),
    // Position in the version's stack; the highest is the official one.
    sequence: d.integer().notNull(),
    parentSnapshotId: d.uuid(),
    origin: d.text().$type<SnapshotOrigin>().notNull(),
    author: d.text().$type<SnapshotAuthor>().notNull(),
    encryptedContent: d.text().notNull(),
    generationId: d.uuid(),
  }),
  (t) => [
    unique("document_snapshots_version_sequence_unique").on(
      t.versionId,
      t.sequence
    ),
  ]
);

/** One generation request: its options and the best round it kept. */
export const generationsTable = createTable(
  "generations",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: createdAt(d),
    profileId: d
      .uuid()
      .notNull()
      .references(() => careerProfilesTable.id, { onDelete: "cascade" }),
    documentId: d
      .uuid()
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    versionId: d
      .uuid()
      .references(() => documentVersionsTable.id, { onDelete: "set null" }),
    language: d.text().$type<OutputLanguage>().notNull(),
    reviewDepth: d.text().$type<ReviewDepth>().notNull(),
    writingLevel: d.text().$type<WritingLevel>().notNull(),
    tone: d.text().$type<Tone>().notNull(),
    status: d.text().$type<GenerationStatus>().notNull().default("pending"),
    bestRound: d.integer(),
    snapshotId: d.uuid(),
    finishedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("generations_document_id_idx").on(t.documentId)]
);

/**
 * Every round's rating, cost and outcome, so the quality gained per extra
 * round can be measured (resume spec, "Review rounds"). Round 0 is the
 * strategist's first draft.
 */
export const reviewRoundsTable = createTable(
  "review_rounds",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: createdAt(d),
    generationId: d
      .uuid()
      .notNull()
      .references(() => generationsTable.id, { onDelete: "cascade" }),
    round: d.integer().notNull(),
    rating: d.integer().notNull(),
    inputTokens: d.integer().notNull(),
    outputTokens: d.integer().notNull(),
    kept: d.boolean().notNull().default(false),
    encryptedReview: d.text(),
  }),
  (t) => [index("review_rounds_generation_id_idx").on(t.generationId)]
);
