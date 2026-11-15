import { sql } from "drizzle-orm";
import { index } from "drizzle-orm/pg-core";

import { careerProfilesTable } from "@repo/api/domains/career/db/career-tables";
import type { InterviewLanguage } from "@repo/api/domains/career/schemas/career";
import { embeddingDimensions } from "@repo/api/tools/embeddings/embedding-model";
import { createTable } from "@repo/api/utils/db/create-table";

import type {
  FitBand,
  FitVerdict,
  OpeningKind,
  OpeningRejectionReason,
  OpeningStatus,
  OpeningTermCategory,
  OpeningTermKind,
  Tone,
} from "../schemas/opening";

/**
 * A target the user may apply to. Text is encrypted with the user's key; the
 * vector (company, role, description) finds similar documents.
 */
export const openingsTable = createTable(
  "openings",
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
    kind: d.text().$type<OpeningKind>().notNull(),
    status: d.text().$type<OpeningStatus>().notNull().default("processing"),
    encryptedCompany: d.text(),
    // Shortened by the AI during keyword extraction, editable by the user;
    // for an unsolicited opening, the intended role or area.
    encryptedTitle: d.text(),
    encryptedDescription: d.text(),
    encryptedNotes: d.text(),
    encryptedSourceUrl: d.text(),
    // Why it was refused (not a job posting, unreadable link…), no content.
    rejectionReason: d.text().$type<OpeningRejectionReason>(),
    // Detected from the description: preselects the output language.
    language: d.text().$type<InterviewLanguage>(),
    suggestedTone: d.text().$type<Tone>(),
    embedding: d.vector({ dimensions: embeddingDimensions }),
    closedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("openings_profile_id_idx").on(t.profileId)]
);

/** The opening's keywords and requirements, each with its own vector. */
export const openingTermsTable = createTable(
  "opening_terms",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    openingId: d
      .uuid()
      .notNull()
      .references(() => openingsTable.id, { onDelete: "cascade" }),
    kind: d.text().$type<OpeningTermKind>().notNull(),
    category: d.text().$type<OpeningTermCategory>().notNull(),
    encryptedText: d.text().notNull(),
    embedding: d.vector({ dimensions: embeddingDimensions }),
  }),
  (t) => [index("opening_terms_opening_id_idx").on(t.openingId)]
);

/** One run of the hybrid fit check for an opening. */
export const fitChecksTable = createTable(
  "fit_checks",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    openingId: d
      .uuid()
      .notNull()
      .references(() => openingsTable.id, { onDelete: "cascade" }),
    band: d.text().$type<FitBand>().notNull(),
  }),
  (t) => [index("fit_checks_opening_id_idx").on(t.openingId)]
);

/**
 * The verdict on one term, the evidence it rests on, and (for a gap) the
 * question that asks whether the user really lacks it.
 */
export const fitCheckItemsTable = createTable(
  "fit_check_items",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    fitCheckId: d
      .uuid()
      .notNull()
      .references(() => fitChecksTable.id, { onDelete: "cascade" }),
    termId: d
      .uuid()
      .notNull()
      .references(() => openingTermsTable.id, { onDelete: "cascade" }),
    verdict: d.text().$type<FitVerdict>().notNull(),
    encryptedExplanation: d.text().notNull(),
    evidenceIds: d
      .uuid()
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    encryptedGapQuestion: d.text(),
    // The user's answer: it becomes an application instruction (slice 4).
    encryptedGapAnswer: d.text(),
    answeredAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("fit_check_items_fit_check_id_idx").on(t.fitCheckId)]
);
