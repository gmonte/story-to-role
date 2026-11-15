import { sql } from "drizzle-orm";
import { index } from "drizzle-orm/pg-core";

import {
  careerProfilesTable,
  credentialsTable,
  positionsTable,
  projectsTable,
  sourceDocumentsTable,
} from "@repo/api/domains/career/db/career-tables";
import type {
  InterviewLanguage,
  ScriptKind,
} from "@repo/api/domains/career/schemas/career";
import type { SensitiveItemKind } from "@repo/api/domains/evidence/schemas/evidence";
import { createTable } from "@repo/api/utils/db/create-table";

import type {
  DraftKind,
  DraftStatus,
  InterviewStage,
  SessionStatus,
  TurnKind,
  TurnRole,
} from "../schemas/interview";

/**
 * One slice of the interview about a single position (or one project of it,
 * or a credential). Once closed, its turns are never loaded into a prompt.
 */
export const interviewSessionsTable = createTable(
  "interview_sessions",
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
    // Null for the "no positions yet" session.
    positionId: d
      .uuid()
      .references(() => positionsTable.id, { onDelete: "cascade" }),
    credentialId: d
      .uuid()
      .references(() => credentialsTable.id, { onDelete: "cascade" }),
    projectId: d
      .uuid()
      .references(() => projectsTable.id, { onDelete: "set null" }),
    status: d.text().$type<SessionStatus>().notNull().default("open"),
    stage: d.text().$type<InterviewStage>().notNull().default("confirm"),
    scriptKind: d.text().$type<ScriptKind>().notNull().default("full"),
    // Size of the session's turns in tokens: drives checkpoints.
    turnTokens: d.integer().notNull().default(0),
    inputTokens: d.integer().notNull().default(0),
    outputTokens: d.integer().notNull().default(0),
    extractionProposedAt: d.timestamp({ withTimezone: true }),
    extractionApprovedAt: d.timestamp({ withTimezone: true }),
    closedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("interview_sessions_profile_id_idx").on(t.profileId),
    index("interview_sessions_position_id_idx").on(t.positionId),
  ]
);

/** Temporary: deleted 7 days after the session's extraction is approved. */
export const interviewTurnsTable = createTable(
  "interview_turns",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    sessionId: d
      .uuid()
      .notNull()
      .references(() => interviewSessionsTable.id, { onDelete: "cascade" }),
    role: d.text().$type<TurnRole>().notNull(),
    kind: d.text().$type<TurnKind>().notNull().default("text"),
    encryptedContent: d.text(),
    language: d.text().$type<InterviewLanguage>().notNull(),
    tokenCount: d.integer().notNull().default(0),
  }),
  (t) => [index("interview_turns_session_id_idx").on(t.sessionId)]
);

/**
 * A fact the position agent noted during a session. Drafts are not
 * evidence: they become it only when the user approves the extraction.
 */
export const draftFactsTable = createTable(
  "draft_facts",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
    sessionId: d
      .uuid()
      .notNull()
      .references(() => interviewSessionsTable.id, { onDelete: "cascade" }),
    kind: d.text().$type<DraftKind>().notNull(),
    // JSON of the draft (text, or problem/action/partners/result), encrypted.
    encryptedPayload: d.text().notNull(),
    // The user's exact words (or the document passage) the draft rests on,
    // checked against its source before it is saved.
    encryptedQuote: d.text().notNull(),
    sourceTurnId: d.uuid(),
    sourceDocumentId: d
      .uuid()
      .references(() => sourceDocumentsTable.id, { onDelete: "set null" }),
    projectId: d
      .uuid()
      .references(() => projectsTable.id, { onDelete: "set null" }),
    language: d.text().$type<InterviewLanguage>().notNull(),
    lowDetail: d.boolean().notNull().default(false),
    status: d.text().$type<DraftStatus>().notNull().default("draft"),
  }),
  (t) => [index("draft_facts_session_id_idx").on(t.sessionId)]
);

/** Sensitive items flagged in a session, reviewed after approval. */
export const draftSensitiveItemsTable = createTable(
  "draft_sensitive_items",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    sessionId: d
      .uuid()
      .notNull()
      .references(() => interviewSessionsTable.id, { onDelete: "cascade" }),
    kind: d.text().$type<SensitiveItemKind>().notNull(),
    encryptedOriginal: d.text().notNull(),
    encryptedSuggestedGeneralization: d.text(),
  }),
  (t) => [index("draft_sensitive_items_session_id_idx").on(t.sessionId)]
);
