import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import {
  careerProfilesTable,
  credentialsTable,
  positionsTable,
} from "@repo/api/domains/career/db/career-tables";
import { evidenceTable } from "@repo/api/domains/evidence/db/evidence-tables";
import type { EvidenceKind } from "@repo/api/domains/evidence/schemas/evidence";
import {
  fitCheckItemsTable,
  openingsTable,
} from "@repo/api/domains/openings/db/openings-tables";
import { createTable } from "@repo/api/utils/db/create-table";

import type {
  InstructionPointStatus,
  InstructionSource,
  InstructionsStatus,
  LockedField,
} from "../schemas/instructions";

/**
 * What the user wrote on the generation screen, kept until a task splits
 * it into points. Keyed by opening: the application itself starts only
 * with its first document (resume spec, "Application instructions").
 */
export const applicationInstructionsTable = createTable(
  "application_instructions",
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
    encryptedText: d.text().notNull(),
    status: d.text().$type<InstructionsStatus>().notNull().default("splitting"),
  }),
  (t) => [index("application_instructions_opening_id_idx").on(t.openingId)]
);

/**
 * One point of the instructions, in the user's words. A draft carries the
 * AI's preselection; once confirmed it is kept for this application, or
 * promoted, when it also became evidence.
 */
export const instructionPointsTable = createTable(
  "instruction_points",
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
    instructionsId: d.uuid().references(() => applicationInstructionsTable.id, {
      onDelete: "set null",
    }),
    source: d.text().$type<InstructionSource>().notNull(),
    fitCheckItemId: d
      .uuid()
      .references(() => fitCheckItemsTable.id, { onDelete: "set null" }),
    sequence: d.integer().notNull(),
    encryptedText: d.text().notNull(),
    status: d.text().$type<InstructionPointStatus>().notNull().default("draft"),
    suggestedPromotion: d.boolean().notNull().default(false),
    positionId: d
      .uuid()
      .references(() => positionsTable.id, { onDelete: "set null" }),
    credentialId: d
      .uuid()
      .references(() => credentialsTable.id, { onDelete: "set null" }),
    evidenceKind: d.text().$type<EvidenceKind>(),
    // Flagged names and figures, inserted as sensitive items on promotion.
    encryptedSensitiveItems: d.text(),
    evidenceId: d
      .uuid()
      .references(() => evidenceTable.id, { onDelete: "set null" }),
    confirmedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("instruction_points_opening_id_idx").on(t.openingId)]
);

/**
 * A different employer, title or date of one position, declared by the
 * user for one application; code prints it there instead of the locked
 * fact once confirmed.
 */
export const lockedFactOverridesTable = createTable(
  "locked_fact_overrides",
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
    positionId: d
      .uuid()
      .notNull()
      .references(() => positionsTable.id, { onDelete: "cascade" }),
    field: d.text().$type<LockedField>().notNull(),
    encryptedValue: d.text().notNull(),
    pointId: d
      .uuid()
      .references(() => instructionPointsTable.id, { onDelete: "set null" }),
    confirmedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    unique("locked_fact_overrides_field_unique").on(
      t.openingId,
      t.positionId,
      t.field
    ),
  ]
);
