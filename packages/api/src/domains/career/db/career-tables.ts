import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { createTable } from "@repo/api/utils/db/create-table";

import type {
  AccountSource,
  CareerEventKind,
  InterviewLanguage,
  InterviewLanguageSource,
  ConflictField,
  CredentialKind,
  CredentialStatus,
  PositionOrigin,
  PositionStatus,
  ScriptKind,
  SourceDocumentKind,
  SourceDocumentStatus,
  TimelineProposalKind,
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

/** One per user: the root of the evidence base. */
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
    // What set the career language: still nothing (the interface's), the
    // first imported file, the first chat message, or the user. Set once,
    // while the profile has no evidence; then it stays.
    interviewLanguageSource: d.text().$type<InterviewLanguageSource>(),
    privacyNoticeAcceptedAt: d.timestamp({ withTimezone: true }),
    // How the user chose to start (workspace spec, "Onboarding").
    startPath: d.text().$type<StartPath>(),
  }),
  (t) => [unique("career_profiles_user_id_unique").on(t.userId)]
);

/** An imported resume or truth file; its text is the source of quotes. */
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
    status: d.text().$type<SourceDocumentStatus>().notNull().default("pending"),
    // Why a file was refused (not a resume, too long…), never its content.
    rejectionReason: d.text(),
    // What the career chat says about the import once it ends, written by
    // the import itself, and when the chat said it (once).
    encryptedReaction: d.text(),
    reactionDeliveredAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("source_documents_profile_id_idx").on(t.profileId)]
);

/**
 * A role at one employer. Employer, title and dates are locked facts once
 * approved; removal is soft so the position and its evidence can come back.
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
    scriptKind: d.text().$type<ScriptKind>().notNull().default("full"),
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

/** Conflicting titles or dates found in different sources. */
export const positionConflictsTable = createTable(
  "position_conflicts",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    ...timestamps(d),
    positionId: d
      .uuid()
      .notNull()
      .references(() => positionsTable.id, { onDelete: "cascade" }),
    field: d.text().$type<ConflictField>().notNull(),
    // JSON array of { value, sourceDocumentId }, encrypted.
    encryptedOptions: d.text().notNull(),
    resolvedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("position_conflicts_position_id_idx").on(t.positionId)]
);

/** A project of a long position, interviewed in its own subsession. */
export const projectsTable = createTable(
  "projects",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    ...timestamps(d),
    positionId: d
      .uuid()
      .notNull()
      .references(() => positionsTable.id, { onDelete: "cascade" }),
    encryptedName: d.text().notNull(),
    period: d.text(),
    closedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("projects_position_id_idx").on(t.positionId)]
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

/** 150–300 words per approved position: what neighbours and the orchestrator see. */
export const positionSummariesTable = createTable(
  "position_summaries",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    ...timestamps(d),
    positionId: d
      .uuid()
      .notNull()
      .references(() => positionsTable.id, { onDelete: "cascade" }),
    encryptedSummary: d.text().notNull(),
    version: d.integer().notNull(),
  }),
  (t) => [index("position_summaries_position_id_idx").on(t.positionId)]
);

/** A mention of another position, noted for when that position is interviewed. */
export const crossNotesTable = createTable(
  "cross_notes",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    ...timestamps(d),
    fromPositionId: d
      .uuid()
      .references(() => positionsTable.id, { onDelete: "set null" }),
    toPositionId: d
      .uuid()
      .notNull()
      .references(() => positionsTable.id, { onDelete: "cascade" }),
    encryptedText: d.text().notNull(),
    resolvedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("cross_notes_to_position_id_idx").on(t.toPositionId)]
);

/** The links between positions, drafted from approved summaries. */
export const careerNarrativesTable = createTable(
  "career_narratives",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    ...timestamps(d),
    profileId: d
      .uuid()
      .notNull()
      .references(() => careerProfilesTable.id, { onDelete: "cascade" }),
    encryptedText: d.text().notNull(),
    encryptedThemes: d.text().notNull(),
    version: d.integer().notNull(),
    approvedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("career_narratives_profile_id_idx").on(t.profileId)]
);

/**
 * A timeline change the interviewer suggested. It is a card in the chat and
 * changes nothing until the user accepts it.
 */
export const timelineProposalsTable = createTable(
  "timeline_proposals",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    ...timestamps(d),
    profileId: d
      .uuid()
      .notNull()
      .references(() => careerProfilesTable.id, { onDelete: "cascade" }),
    sessionId: d.uuid(),
    kind: d.text().$type<TimelineProposalKind>().notNull(),
    encryptedPayload: d.text().notNull(),
    acceptedAt: d.timestamp({ withTimezone: true }),
    rejectedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("timeline_proposals_profile_id_idx").on(t.profileId)]
);

/**
 * What the user did to their career outside the chat (approved a position,
 * merged two items, resolved a conflict…), so the career chat knows it on
 * its next turn and, for the changes that move the next step, says
 * something by itself. The summary names career content: encrypted.
 */
export const careerEventsTable = createTable(
  "career_events",
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
    kind: d.text().$type<CareerEventKind>().notNull(),
    encryptedSummary: d.text().notNull(),
    // Worth a word from the chat by itself, not only context for the next turn.
    reactive: d.boolean().notNull().default(false),
    // When the chat took it in (a turn's context or its own reaction).
    seenAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("career_events_profile_id_idx").on(t.profileId)]
);

/**
 * A position's account (ADR 0008): the user's own text about it, kept as
 * versions. The latest approved version is the account; a newer unapproved
 * one is its draft. Text and "do not include" list are encrypted.
 */
export const positionAccountVersionsTable = createTable(
  "position_account_versions",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    ...timestamps(d),
    profileId: d
      .uuid()
      .notNull()
      .references(() => careerProfilesTable.id, { onDelete: "cascade" }),
    positionId: d
      .uuid()
      .notNull()
      .references(() => positionsTable.id, { onDelete: "cascade" }),
    // Numbered when approved: 1 is the first approved account.
    version: d.integer(),
    encryptedText: d.text().notNull(),
    // JSON array of names and figures never to appear in what is generated.
    encryptedDoNotInclude: d.text().notNull(),
    // Who wrote it: the user, the interviewer, an import, the migration.
    source: d.text().$type<AccountSource>().notNull(),
    // The approved version a restore copied, when it is one.
    restoredFromId: d.uuid(),
    approvedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("position_account_versions_position_id_idx").on(t.positionId)]
);
