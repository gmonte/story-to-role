import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { careerProfilesTable } from "@repo/api/domains/career/db/career-tables";
import {
  documentSnapshotsTable,
  documentVersionsTable,
} from "@repo/api/domains/documents/db/documents-tables";
import { createTable } from "@repo/api/utils/db/create-table";

import type { ApplicationStatus } from "../schemas/application";
import type { ApplicationEventKind } from "../schemas/tracker";
import { applicationsTable } from "./applications-tables";

const createdAt = (d: Parameters<Parameters<typeof createTable>[1]>[0]) =>
  d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull();

/**
 * A dated entry on the application's timeline (tracker spec): "HR
 * interview on Nov 20", "technical test delivered", or a status change.
 * A future date makes it a reminder.
 */
export const applicationEventsTable = createTable(
  "application_events",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: createdAt(d),
    applicationId: d
      .uuid()
      .notNull()
      .references(() => applicationsTable.id, { onDelete: "cascade" }),
    kind: d.text().$type<ApplicationEventKind>().notNull(),
    occurredAt: d.timestamp({ withTimezone: true }).notNull(),
    encryptedText: d.text(),
    // A status change records where it came from, so "No response" can
    // reopen to the status it closed.
    fromStatus: d.text().$type<ApplicationStatus>(),
    toStatus: d.text().$type<ApplicationStatus>(),
  }),
  (t) => [index("application_events_application_id_idx").on(t.applicationId)]
);

/**
 * What was sent (tracker spec: marking applied "records the exact snapshot
 * of each version sent"; documents are never frozen).
 */
export const applicationSubmissionsTable = createTable(
  "application_submissions",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: createdAt(d),
    applicationId: d
      .uuid()
      .notNull()
      .references(() => applicationsTable.id, { onDelete: "cascade" }),
    versionId: d
      .uuid()
      .notNull()
      .references(() => documentVersionsTable.id, { onDelete: "cascade" }),
    snapshotId: d
      .uuid()
      .notNull()
      .references(() => documentSnapshotsTable.id, { onDelete: "cascade" }),
  }),
  (t) => [
    index("application_submissions_application_id_idx").on(t.applicationId),
  ]
);

/** The user's tracker settings (reminders are configurable). */
export const trackerSettingsTable = createTable(
  "tracker_settings",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: createdAt(d),
    profileId: d
      .uuid()
      .notNull()
      .references(() => careerProfilesTable.id, { onDelete: "cascade" }),
    remindersEnabled: d.boolean().notNull().default(true),
    followUpDays: d.integer().notNull().default(10),
    noResponseDays: d.integer().notNull().default(30),
  }),
  (t) => [unique("tracker_settings_profile_id_unique").on(t.profileId)]
);

/** A reminder the user dismissed; its key names what it was about. */
export const dismissedRemindersTable = createTable(
  "dismissed_reminders",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: createdAt(d),
    profileId: d
      .uuid()
      .notNull()
      .references(() => careerProfilesTable.id, { onDelete: "cascade" }),
    reminderKey: d.text().notNull(),
  }),
  (t) => [
    unique("dismissed_reminders_profile_id_key_unique").on(
      t.profileId,
      t.reminderKey
    ),
  ]
);
