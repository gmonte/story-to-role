import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { careerProfilesTable } from "@repo/api/domains/career/db/career-tables";
import { createTable } from "@repo/api/utils/db/create-table";

import type {
  LinkedinInstructionStatus,
  LinkedinInterviewStatus,
  LinkedinTurnRole,
} from "../schemas/linkedin-interview";
import { documentsTable } from "./documents-tables";

const createdAt = (d: Parameters<Parameters<typeof createTable>[1]>[0]) =>
  d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull();

/**
 * A LinkedIn step's questions (resume spec, "LinkedIn", "Step by step"):
 * one interview per section of the user's LinkedIn document, asked again
 * from scratch when the step is.
 */
export const linkedinInterviewsTable = createTable(
  "linkedin_interviews",
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
    // The step's section: `headline`, `about`, `experiences`, `projects`,
    // `education`, or the id of one position, project or education.
    section: d.text().notNull(),
    status: d
      .text()
      .$type<LinkedinInterviewStatus>()
      .notNull()
      .default("in_progress"),
  }),
  (t) => [
    unique("linkedin_interviews_section_unique").on(t.documentId, t.section),
  ]
);

export const linkedinTurnsTable = createTable(
  "linkedin_turns",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: createdAt(d),
    interviewId: d
      .uuid()
      .notNull()
      .references(() => linkedinInterviewsTable.id, { onDelete: "cascade" }),
    sequence: d.integer().notNull(),
    role: d.text().$type<LinkedinTurnRole>().notNull(),
    encryptedText: d.text().notNull(),
  }),
  (t) => [
    unique("linkedin_turns_sequence_unique").on(t.interviewId, t.sequence),
  ]
);

/**
 * A LinkedIn instruction: a point of the user's answers, in their words,
 * kept with the LinkedIn document and cited by its writer like a profile
 * line. Tied to the position, project or education it is about, if any.
 */
export const linkedinInstructionsTable = createTable(
  "linkedin_instructions",
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
    // The step it was answered in, to list it there.
    section: d.text().notNull(),
    positionId: d.uuid(),
    projectId: d.uuid(),
    credentialId: d.uuid(),
    encryptedText: d.text().notNull(),
    status: d
      .text()
      .$type<LinkedinInstructionStatus>()
      .notNull()
      .default("kept"),
  }),
  (t) => [index("linkedin_instructions_document_idx").on(t.documentId)]
);
