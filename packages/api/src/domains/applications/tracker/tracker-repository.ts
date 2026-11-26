import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";

import {
  documentsTable,
  documentSnapshotsTable,
  documentVersionsTable,
  generationsTable,
  reviewRoundsTable,
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
import type {
  BoardFilter,
  BoardSort,
  BoardState,
  BoardStatus,
} from "../schemas/tracker";
import { boardStatusOrder, openBoardStatuses } from "./board";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

const applicationColumns = {
  application: applicationsTable,
  encryptedCompany: openingsTable.encryptedCompany,
  encryptedTitle: openingsTable.encryptedTitle,
};

const textList = (values: readonly string[]) =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  );

/**
 * Where an opening stands (tracker spec, “Where an opening stands”): its
 * application's status, else Analyzed, or Closed for a closed opening.
 */
const boardStatus = sql<BoardStatus>`case when ${applicationsTable.id} is not null then ${applicationsTable.status} when ${openingsTable.status} = 'closed' then 'closed' else 'analyzed' end`;

const boardState = sql<BoardState>`case when ${openingsTable.status} <> 'closed' and (${boardStatus}) in (${textList(openBoardStatuses)}) then 'open' else 'closed' end`;

/** An opening with no application last moved when it was added or closed. */
const lastActivity = sql`coalesce(${applicationsTable.lastActivityAt}, ${openingsTable.closedAt}, ${openingsTable.createdAt})`;

const latestBand = sql<
  "high" | "medium" | "low" | null
>`(select ${fitChecksTable.band} from ${fitChecksTable} where ${fitChecksTable.openingId} = ${openingsTable.id} order by ${fitChecksTable.createdAt} desc limit 1)`;

const statusRank = sql<number>`array_position(array[${textList(boardStatusOrder)}]::text[], ${boardStatus})`;

/** Not sent sorts last among dates newest first. */
const sentKey = sql`coalesce(${applicationsTable.appliedAt}, '-infinity'::timestamptz)`;

/** The filter's fields SQL sees, as text to match against the values. */
const boardFields = {
  status: boardStatus,
  state: boardState,
  source: sql`${applicationsTable.source}`,
  fit: sql`coalesce(${latestBand}, 'not_checked')`,
  sent: sql`case when ${applicationsTable.appliedAt} is not null then 'sent' else 'not_sent' end`,
} as const;

/** A keyset boundary: the sort's keys as Postgres text, and the id. */
export type BoardKeyset = { keys: Array<string | number>; id: string };

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

  /**
   * The Openings page's rows (tracker spec): every analyzed or closed
   * opening, with or without an application, filtered on the structured
   * fields (ADR 0014). With `limit`, a keyset page in the sort's order (ADR
   * 0013); without, every matching row, for the service to sort itself.
   */
  boardRows(input: {
    profileId: string;
    filter: BoardFilter;
    column?: BoardStatus;
    sort: Exclude<BoardSort, "company">;
    after?: BoardKeyset | null;
    limit?: number;
  }) {
    const after = input.after ? this.boardAfter(input.sort, input.after) : null;
    const order =
      input.sort === "sent"
        ? [desc(sentKey), desc(lastActivity), desc(openingsTable.id)]
        : input.sort === "status"
          ? [asc(statusRank), desc(lastActivity), desc(openingsTable.id)]
          : [desc(lastActivity), desc(openingsTable.id)];
    const query = this.tx
      .select({
        openingId: openingsTable.id,
        addedAt: openingsTable.createdAt,
        applicationId: applicationsTable.id,
        encryptedCompany: openingsTable.encryptedCompany,
        encryptedTitle: openingsTable.encryptedTitle,
        status: boardStatus,
        state: boardState,
        external: sql<boolean>`coalesce(${applicationsTable.external}, false)`,
        lastActivityAt: lastActivity.mapWith(openingsTable.createdAt),
        appliedAt: applicationsTable.appliedAt,
        source: applicationsTable.source,
        fitBand: latestBand,
        encryptedNextStep: applicationsTable.encryptedNextStep,
        // The keyset's keys, as Postgres text: a JS date drops microseconds.
        activityKey: sql<string>`(${lastActivity})::text`,
        sentKey: sql<string>`(${sentKey})::text`,
        statusRank,
      })
      .from(openingsTable)
      .leftJoin(
        applicationsTable,
        eq(applicationsTable.openingId, openingsTable.id)
      )
      .where(and(this.boardWhere(input), after ?? undefined))
      .orderBy(...order)
      .$dynamic();
    return input.limit ? query.limit(input.limit) : query;
  }

  async boardCount(input: {
    profileId: string;
    filter: BoardFilter;
    column?: BoardStatus;
  }) {
    const [row] = await this.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(openingsTable)
      .leftJoin(
        applicationsTable,
        eq(applicationsTable.openingId, openingsTable.id)
      )
      .where(this.boardWhere(input));
    return row?.count ?? 0;
  }

  /** The applications' timelines, for the calendar's milestones. */
  async timelines(applicationIds: string[]) {
    if (applicationIds.length === 0) return [];
    return this.tx
      .select({
        applicationId: applicationEventsTable.applicationId,
        kind: applicationEventsTable.kind,
        occurredAt: applicationEventsTable.occurredAt,
        encryptedText: applicationEventsTable.encryptedText,
        toStatus: applicationEventsTable.toStatus,
      })
      .from(applicationEventsTable)
      .where(inArray(applicationEventsTable.applicationId, applicationIds));
  }

  /**
   * Where each application's resume came from: the resumes sent, the one
   * picked by hand and its own resume's versions; a version is a library
   * one when copied from the library or a library document itself.
   */
  async resumeCandidates(applicationIds: string[]) {
    if (applicationIds.length === 0) return [];
    const library = sql<boolean>`(${documentVersionsTable.libraryVersionId} is not null or ${documentsTable.applicationId} is null)`;
    const resumes = and(
      eq(documentsTable.kind, "resume"),
      eq(documentVersionsTable.documentId, documentsTable.id)
    );
    const sent = await this.tx
      .select({
        applicationId: applicationSubmissionsTable.applicationId,
        library,
        at: applicationSubmissionsTable.createdAt,
      })
      .from(applicationSubmissionsTable)
      .innerJoin(
        documentVersionsTable,
        eq(documentVersionsTable.id, applicationSubmissionsTable.versionId)
      )
      .innerJoin(documentsTable, resumes)
      .where(
        inArray(applicationSubmissionsTable.applicationId, applicationIds)
      );
    const picked = await this.tx
      .select({
        applicationId: applicationsTable.id,
        library,
        at: documentVersionsTable.createdAt,
      })
      .from(applicationsTable)
      .innerJoin(
        documentVersionsTable,
        eq(documentVersionsTable.id, applicationsTable.pickedResumeVersionId)
      )
      .innerJoin(documentsTable, resumes)
      .where(inArray(applicationsTable.id, applicationIds));
    const own = await this.tx
      .select({
        applicationId: sql<string>`${documentsTable.applicationId}`,
        library,
        at: documentVersionsTable.createdAt,
      })
      .from(documentsTable)
      .innerJoin(documentVersionsTable, resumes)
      .where(inArray(documentsTable.applicationId, applicationIds));
    return [
      ...sent.map((row) => ({ ...row, kind: "sent" as const })),
      ...picked.map((row) => ({ ...row, kind: "picked" as const })),
      ...own.map((row) => ({ ...row, kind: "own" as const })),
    ];
  }

  private boardWhere(input: {
    profileId: string;
    filter: BoardFilter;
    column?: BoardStatus;
  }) {
    const conditions: SQL[] = [
      eq(openingsTable.profileId, input.profileId),
      // Openings still processing, failed or refused never show.
      or(
        isNotNull(applicationsTable.id),
        inArray(openingsTable.status, ["analyzed", "closed"])
      )!,
    ];
    if (input.column) conditions.push(sql`(${boardStatus}) = ${input.column}`);
    for (const [field, expression] of Object.entries(boardFields)) {
      const key = field as keyof typeof boardFields;
      const is = input.filter[key];
      const not = input.filter[`${key}Not`];
      // A missing value (no application) matches no value: never "is",
      // always "is not".
      const matches = (values: readonly string[]) =>
        sql`coalesce((${expression}) in (${textList(values)}), false)`;
      if (is?.length) conditions.push(matches(is));
      if (not?.length) conditions.push(sql`not ${matches(not)}`);
    }
    return and(...conditions);
  }

  /** Rows after a keyset boundary, in the sort's order. */
  private boardAfter(sort: Exclude<BoardSort, "company">, after: BoardKeyset) {
    const [first, second] = after.keys;
    const id = sql`${after.id}::uuid`;
    switch (sort) {
      case "activity":
        return sql`((${lastActivity}), ${openingsTable.id}) < (${first}::timestamptz, ${id})`;
      case "sent":
        return sql`((${sentKey}), (${lastActivity}), ${openingsTable.id}) < (${first}::timestamptz, ${second}::timestamptz, ${id})`;
      case "status":
        return sql`((${statusRank}) > ${first}::int or ((${statusRank}) = ${first}::int and ((${lastActivity}), ${openingsTable.id}) < (${second}::timestamptz, ${id})))`;
    }
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

  /**
   * Where each sent resume version came from and how it was rated, for the
   * metrics by origin and by score: the library document it was copied or
   * adapted from, and the kept round of the review that judged its latest
   * judged snapshot (as `reviewViewOf` reads it). Versions without a
   * review have no rating.
   */
  async versionOrigins(versionIds: string[]) {
    if (versionIds.length === 0) {
      return { versions: [], libraries: [], rounds: [] };
    }
    // A version of a library document (outside any application, one
    // picked by hand) is its own library source.
    const versions = (
      await this.tx
        .select({
          versionId: documentVersionsTable.id,
          libraryVersionId: documentVersionsTable.libraryVersionId,
          applicationId: documentsTable.applicationId,
        })
        .from(documentVersionsTable)
        .innerJoin(
          documentsTable,
          eq(documentsTable.id, documentVersionsTable.documentId)
        )
        .where(inArray(documentVersionsTable.id, versionIds))
    ).map((v) => ({
      versionId: v.versionId,
      libraryVersionId:
        v.libraryVersionId ?? (v.applicationId ? null : v.versionId),
    }));
    const libraryIds = versions.flatMap((v) =>
      v.libraryVersionId ? [v.libraryVersionId] : []
    );
    const libraries =
      libraryIds.length === 0
        ? []
        : await this.tx
            .select({
              versionId: documentVersionsTable.id,
              documentId: documentsTable.id,
              encryptedLabel: documentVersionsTable.encryptedLabel,
              encryptedFocus: documentsTable.encryptedFocus,
            })
            .from(documentVersionsTable)
            .innerJoin(
              documentsTable,
              eq(documentsTable.id, documentVersionsTable.documentId)
            )
            .where(inArray(documentVersionsTable.id, libraryIds));
    const rounds = await this.tx
      .select({
        versionId: generationsTable.versionId,
        generationSnapshotId: generationsTable.snapshotId,
        snapshotId: reviewRoundsTable.snapshotId,
        rating: reviewRoundsTable.rating,
        kept: reviewRoundsTable.kept,
      })
      .from(reviewRoundsTable)
      .innerJoin(
        generationsTable,
        eq(generationsTable.id, reviewRoundsTable.generationId)
      )
      .where(inArray(generationsTable.versionId, versionIds))
      .orderBy(asc(reviewRoundsTable.createdAt), asc(reviewRoundsTable.round));
    return { versions, libraries, rounds };
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

  /** Each opening's latest fit band. */
  async latestFitBands(openingIds: string[]) {
    const bands = new Map<string, "high" | "medium" | "low">();
    if (openingIds.length === 0) return bands;
    const rows = await this.tx
      .select({
        openingId: fitChecksTable.openingId,
        band: fitChecksTable.band,
      })
      .from(fitChecksTable)
      .where(inArray(fitChecksTable.openingId, openingIds))
      .orderBy(desc(fitChecksTable.createdAt));
    // Newest first: the first row of each opening is its latest check.
    for (const row of rows) {
      if (!bands.has(row.openingId)) bands.set(row.openingId, row.band);
    }
    return bands;
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
