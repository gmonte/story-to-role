import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  lt,
  sql,
} from "drizzle-orm";

import {
  documentsTable,
  documentSnapshotsTable,
  documentVersionsTable,
} from "@repo/api/domains/documents/db/documents-tables";
import {
  fitChecksTable,
  openingsTable,
} from "@repo/api/domains/openings/db/openings-tables";
import type { DbClient } from "@repo/api/tools/db-client";

import { applicationsTable } from "../db/applications-tables";
import {
  applicationEventsTable,
  applicationSubmissionsTable,
  dismissedRemindersTable,
  trackerSettingsTable,
} from "../db/tracker-tables";
import {
  type ApplicationStatus,
  awaitingStatuses,
} from "../schemas/application";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

const applicationColumns = {
  application: applicationsTable,
  encryptedCompany: openingsTable.encryptedCompany,
  encryptedTitle: openingsTable.encryptedTitle,
};

export class TrackerRepository {
  constructor(private readonly tx: DbClient) {}

  /** The profile's applications with their opening, latest change first. */
  listApplications(profileId: string) {
    return this.tx
      .select(applicationColumns)
      .from(applicationsTable)
      .innerJoin(
        openingsTable,
        eq(openingsTable.id, applicationsTable.openingId)
      )
      .where(eq(applicationsTable.profileId, profileId))
      .orderBy(desc(applicationsTable.statusChangedAt));
  }

  findApplication(input: { profileId: string; applicationId: string }) {
    return this.tx
      .select(applicationColumns)
      .from(applicationsTable)
      .innerJoin(
        openingsTable,
        eq(openingsTable.id, applicationsTable.openingId)
      )
      .where(
        and(
          eq(applicationsTable.id, input.applicationId),
          eq(applicationsTable.profileId, input.profileId)
        )
      )
      .then((rows) => rows[0] ?? null);
  }

  async insertApplication(row: Insert<typeof applicationsTable>) {
    const [inserted] = await this.tx
      .insert(applicationsTable)
      .values(row)
      .returning();
    return inserted;
  }

  /**
   * Changes the status only if it is still `from` (and, for the automatic
   * close, nothing happened since `quietBefore`): a concurrent change wins
   * instead of being overwritten. Whether it changed.
   */
  async transitionStatus(input: {
    applicationId: string;
    from: ApplicationStatus;
    changes: Partial<Insert<typeof applicationsTable>>;
    quietBefore?: Date;
  }) {
    const changed = await this.tx
      .update(applicationsTable)
      .set(input.changes)
      .where(
        and(
          eq(applicationsTable.id, input.applicationId),
          eq(applicationsTable.status, input.from),
          input.quietBefore
            ? lt(applicationsTable.lastActivityAt, input.quietBefore)
            : undefined
        )
      )
      .returning({ id: applicationsTable.id });
    return changed.length > 0;
  }

  async updateApplication(
    applicationId: string,
    changes: Partial<Insert<typeof applicationsTable>>
  ) {
    await this.tx
      .update(applicationsTable)
      .set(changes)
      .where(eq(applicationsTable.id, applicationId));
  }

  /** Each application's first event still ahead of `now`. */
  async nextEvents(applicationIds: string[], now: Date) {
    if (applicationIds.length === 0) return [];
    return this.tx
      .selectDistinctOn([applicationEventsTable.applicationId])
      .from(applicationEventsTable)
      .where(
        and(
          inArray(applicationEventsTable.applicationId, applicationIds),
          gt(applicationEventsTable.occurredAt, now),
          eq(applicationEventsTable.kind, "note")
        )
      )
      .orderBy(
        applicationEventsTable.applicationId,
        asc(applicationEventsTable.occurredAt)
      );
  }

  async insertEvent(row: Insert<typeof applicationEventsTable>) {
    await this.tx.insert(applicationEventsTable).values(row);
  }

  listEvents(applicationId: string) {
    return this.tx
      .select()
      .from(applicationEventsTable)
      .where(eq(applicationEventsTable.applicationId, applicationId))
      .orderBy(desc(applicationEventsTable.occurredAt));
  }

  /**
   * The profile's resume versions (optionally only some), each with what
   * names it when it has no label: its document's focus, or the opening of
   * its application.
   */
  resumeVersions(profileId: string, versionIds?: string[]) {
    if (versionIds?.length === 0) return Promise.resolve([]);
    return this.tx
      .select({
        versionId: documentVersionsTable.id,
        language: documentVersionsTable.language,
        encryptedLabel: documentVersionsTable.encryptedLabel,
        encryptedFocus: documentsTable.encryptedFocus,
        encryptedCompany: openingsTable.encryptedCompany,
        encryptedTitle: openingsTable.encryptedTitle,
      })
      .from(documentVersionsTable)
      .innerJoin(
        documentsTable,
        eq(documentsTable.id, documentVersionsTable.documentId)
      )
      .leftJoin(
        applicationsTable,
        eq(applicationsTable.id, documentsTable.applicationId)
      )
      .leftJoin(
        openingsTable,
        eq(openingsTable.id, applicationsTable.openingId)
      )
      .where(
        and(
          eq(documentsTable.profileId, profileId),
          eq(documentsTable.kind, "resume"),
          versionIds ? inArray(documentVersionsTable.id, versionIds) : undefined
        )
      )
      .orderBy(desc(documentVersionsTable.createdAt));
  }

  /** What the metrics read: sent applications and their structured facts. */
  async metricsInputs(profileId: string) {
    const applications = await this.tx
      .select({
        id: applicationsTable.id,
        openingId: applicationsTable.openingId,
        status: applicationsTable.status,
        source: applicationsTable.source,
        appliedAt: applicationsTable.appliedAt,
        pickedResumeVersionId: applicationsTable.pickedResumeVersionId,
      })
      .from(applicationsTable)
      .where(
        and(
          eq(applicationsTable.profileId, profileId),
          isNotNull(applicationsTable.appliedAt)
        )
      );
    const ids = applications.map((a) => a.id);
    if (ids.length === 0) {
      return { applications, changes: [], submissions: [], bands: [] };
    }
    const changes = await this.tx
      .select({
        applicationId: applicationEventsTable.applicationId,
        fromStatus: applicationEventsTable.fromStatus,
        toStatus: applicationEventsTable.toStatus,
        occurredAt: applicationEventsTable.occurredAt,
      })
      .from(applicationEventsTable)
      .where(
        and(
          inArray(applicationEventsTable.applicationId, ids),
          eq(applicationEventsTable.kind, "status_change")
        )
      );
    const submissions = await this.tx
      .select({
        applicationId: applicationSubmissionsTable.applicationId,
        versionId: applicationSubmissionsTable.versionId,
      })
      .from(applicationSubmissionsTable)
      .innerJoin(
        documentVersionsTable,
        eq(documentVersionsTable.id, applicationSubmissionsTable.versionId)
      )
      .innerJoin(
        documentsTable,
        eq(documentsTable.id, documentVersionsTable.documentId)
      )
      .where(
        and(
          inArray(applicationSubmissionsTable.applicationId, ids),
          eq(documentsTable.kind, "resume")
        )
      );
    const bands = await this.tx
      .select({
        openingId: fitChecksTable.openingId,
        band: fitChecksTable.band,
      })
      .from(fitChecksTable)
      .where(
        inArray(
          fitChecksTable.openingId,
          applications.map((a) => a.openingId)
        )
      )
      .orderBy(desc(fitChecksTable.createdAt));
    return { applications, changes, submissions, bands };
  }

  /** The status a "No response" closed: what an event reopens it to. */
  async statusBeforeNoResponse(applicationId: string) {
    const [row] = await this.tx
      .select({ fromStatus: applicationEventsTable.fromStatus })
      .from(applicationEventsTable)
      .where(
        and(
          eq(applicationEventsTable.applicationId, applicationId),
          eq(applicationEventsTable.toStatus, "no_response")
        )
      )
      .orderBy(desc(applicationEventsTable.createdAt))
      .limit(1);
    return row?.fromStatus ?? null;
  }

  async deleteEvent(input: { applicationId: string; eventId: string }) {
    const deleted = await this.tx
      .delete(applicationEventsTable)
      .where(
        and(
          eq(applicationEventsTable.id, input.eventId),
          eq(applicationEventsTable.applicationId, input.applicationId),
          eq(applicationEventsTable.kind, "note")
        )
      )
      .returning({ id: applicationEventsTable.id });
    return deleted.length > 0;
  }

  /**
   * The application's versions with the snapshot each had at `asOf` (the
   * day it was sent); a version born later offers its first one.
   */
  applicationVersions(applicationId: string, asOf: Date) {
    const asOfText = asOf.toISOString();
    return this.tx
      .select({
        versionId: documentVersionsTable.id,
        snapshotId: sql<string>`coalesce(
          (select ${documentSnapshotsTable.id} from ${documentSnapshotsTable} where ${documentSnapshotsTable.versionId} = ${documentVersionsTable.id} and ${documentSnapshotsTable.createdAt} <= ${asOfText}::timestamptz order by ${documentSnapshotsTable.sequence} desc limit 1),
          (select ${documentSnapshotsTable.id} from ${documentSnapshotsTable} where ${documentSnapshotsTable.versionId} = ${documentVersionsTable.id} order by ${documentSnapshotsTable.sequence} asc limit 1)
        )`,
      })
      .from(documentVersionsTable)
      .innerJoin(
        documentsTable,
        eq(documentsTable.id, documentVersionsTable.documentId)
      )
      .where(eq(documentsTable.applicationId, applicationId));
  }

  async insertSubmissions(
    rows: Array<Insert<typeof applicationSubmissionsTable>>
  ) {
    if (rows.length === 0) return;
    await this.tx.insert(applicationSubmissionsTable).values(rows);
  }

  /** "Applied" undone: nothing was sent after all. */
  async deleteSubmissions(applicationId: string) {
    await this.tx
      .delete(applicationSubmissionsTable)
      .where(eq(applicationSubmissionsTable.applicationId, applicationId));
  }

  listSubmissions(applicationId: string) {
    return this.tx
      .select({
        versionId: applicationSubmissionsTable.versionId,
        snapshotId: applicationSubmissionsTable.snapshotId,
        sentAt: applicationSubmissionsTable.createdAt,
        documentKind: documentsTable.kind,
        language: documentVersionsTable.language,
        encryptedLabel: documentVersionsTable.encryptedLabel,
      })
      .from(applicationSubmissionsTable)
      .innerJoin(
        documentVersionsTable,
        eq(documentVersionsTable.id, applicationSubmissionsTable.versionId)
      )
      .innerJoin(
        documentsTable,
        eq(documentsTable.id, documentVersionsTable.documentId)
      )
      .where(eq(applicationSubmissionsTable.applicationId, applicationId))
      .orderBy(desc(applicationSubmissionsTable.createdAt));
  }

  findSettings(profileId: string) {
    return this.tx
      .select()
      .from(trackerSettingsTable)
      .where(eq(trackerSettingsTable.profileId, profileId))
      .then((rows) => rows[0] ?? null);
  }

  async upsertSettings(row: Insert<typeof trackerSettingsTable>) {
    const { profileId: _profileId, ...changes } = row;
    await this.tx.insert(trackerSettingsTable).values(row).onConflictDoUpdate({
      target: trackerSettingsTable.profileId,
      set: changes,
    });
  }

  async listDismissed(profileId: string) {
    const rows = await this.tx
      .select({ key: dismissedRemindersTable.reminderKey })
      .from(dismissedRemindersTable)
      .where(eq(dismissedRemindersTable.profileId, profileId));
    return rows.map((row) => row.key);
  }

  async dismiss(profileId: string, reminderKey: string) {
    await this.tx
      .insert(dismissedRemindersTable)
      .values({ profileId, reminderKey })
      .onConflictDoNothing();
  }

  /**
   * Applications waiting on the company with nothing for longer than their
   * owner's "No response" setting (30 days by default).
   */
  unanswered(now: Date) {
    return this.tx
      .select({
        id: applicationsTable.id,
        status: applicationsTable.status,
        noResponseDays: sql<number>`coalesce(${trackerSettingsTable.noResponseDays}, 30)::int`,
      })
      .from(applicationsTable)
      .leftJoin(
        trackerSettingsTable,
        eq(trackerSettingsTable.profileId, applicationsTable.profileId)
      )
      .where(
        and(
          inArray(applicationsTable.status, awaitingStatuses),
          lt(
            applicationsTable.lastActivityAt,
            sql`${now.toISOString()}::timestamptz - make_interval(days => coalesce(${trackerSettingsTable.noResponseDays}, 30))`
          )
        )
      );
  }
}
