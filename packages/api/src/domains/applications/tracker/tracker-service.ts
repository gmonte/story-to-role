import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import {
  assertSendable,
  FrozenContexts,
} from "@repo/api/domains/documents/coverage-review/snapshot-coverage";
import { DocumentsRepository } from "@repo/api/domains/documents/documents-repository";
import {
  getUserCipher,
  type UserCipher,
} from "@repo/api/domains/encryption/user-cipher";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import { OpeningsService } from "@repo/api/domains/openings/openings-service";
import { ProfileService } from "@repo/api/domains/profile/profile-service";
import type { ProfileLanguage } from "@repo/api/domains/profile/truth/sections";
import type { DbClient } from "@repo/api/tools/db-client";
import { encodeCursor, decodeCursor } from "@repo/api/utils/db/keyset";

import {
  type ApplicationSource,
  type ApplicationStatus,
  applicationStatusSchema,
  closedStatuses,
} from "../schemas/application";
import type {
  ApplicationDetail,
  BoardFilter,
  CalendarMarker,
  CalendarShow,
  BoardOpening,
  BoardSort,
  BoardStatus,
  MetricsPeriod,
  Reminder,
  ResumeVersionRef,
  TrackedApplication,
  TrackerSettings,
} from "../schemas/tracker";
import {
  compareBoardRows,
  matchesMemoryFilter,
  needsMemory,
  resumeOriginOf,
} from "./board";
import { calendarMarkers } from "./calendar";
import { computeMetrics, type MetricsRow } from "./metrics";
import { computeReminders } from "./reminders";
import { TrackerRepository } from "./tracker-repository";

const day = 24 * 3600 * 1000;

const latest = (a: Date, b: Date) => (a > b ? a : b);

/** The end of a sent day, or now when it is today. */
const endOfDay = (date: Date, now: Date) => {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end < now ? end : now;
};

/**
 * Whether the user may move an application to a status by hand: "No
 * response" is only set by time (tracker spec), and "Applied" with
 * documents goes through markApplied, which records what was sent.
 */
/**
 * A status the user sets by hand: "No response" only comes with time, and
 * "Applied" records what was sent, unless the application was already sent
 * (back to Applied, keeping that record).
 */
function manualStatus(status: ApplicationStatus, appliedAt: Date | null) {
  if (status === "no_response") return false;
  return status !== "applied" || appliedAt !== null;
}

const defaultSettings: TrackerSettings = {
  remindersEnabled: true,
  followUpDays: 10,
  noResponseDays: 30,
};

const open = (cipher: UserCipher, value: string | null) =>
  value ? cipher.decrypt(value) : null;

type VersionRow = Awaited<
  ReturnType<TrackerRepository["resumeVersions"]>
>[number];

/** A version's name: its label, else its document's focus, else its opening. */
function versionRef(cipher: UserCipher, row: VersionRow): ResumeVersionRef {
  const company = open(cipher, row.encryptedCompany);
  const title = open(cipher, row.encryptedTitle);
  return {
    versionId: row.versionId,
    language: row.language,
    label:
      open(cipher, row.encryptedLabel) ??
      open(cipher, row.encryptedFocus) ??
      ([company, title].filter(Boolean).join(" - ") || null),
  };
}

/** Free text from a form: empty clears it. */
const seal = (cipher: UserCipher, value: string | null) =>
  value?.trim() ? cipher.encrypt(value.trim()) : null;

type BoardRow = Awaited<ReturnType<TrackerRepository["boardRows"]>>[number];

/** A board status that is an application's own (not Not analyzed, Analyzed or Closed). */
const isApplicationStatus = (
  status: BoardOpening["status"]
): status is ApplicationStatus =>
  applicationStatusSchema.options.includes(status as ApplicationStatus);

/** Each row's resume origin; null for an opening with no application. */
async function boardOrigins(repository: TrackerRepository, rows: BoardRow[]) {
  const candidates = await repository.resumeCandidates(
    rows.flatMap((row) => (row.applicationId ? [row.applicationId] : []))
  );
  const byApplication = Map.groupBy(
    candidates,
    (candidate) => candidate.applicationId
  );
  return new Map(
    rows.map((row) => [
      row.openingId,
      row.applicationId
        ? resumeOriginOf(byApplication.get(row.applicationId) ?? [])
        : null,
    ])
  );
}

function openBoardRow(
  cipher: UserCipher,
  row: BoardRow,
  origin: BoardOpening["resumeOrigin"]
): BoardOpening & { addedAt: Date } {
  return {
    openingId: row.openingId,
    applicationId: row.applicationId,
    company: open(cipher, row.encryptedCompany),
    title: open(cipher, row.encryptedTitle),
    status: row.status,
    state: row.state,
    lastActivityAt: row.lastActivityAt,
    appliedAt: row.appliedAt,
    source: row.source,
    fitBand: row.fitBand,
    resumeOrigin: origin,
    nextStep: open(cipher, row.encryptedNextStep),
    nextEvent: null,
    addedAt: row.addedAt,
  };
}

/**
 * Every opening the filter matches, decrypted, in the sort's order: the
 * structured filters in SQL, then company, title and the resume's origin
 * in memory (ADR 0014).
 */
async function allMatching(
  repository: TrackerRepository,
  cipher: UserCipher,
  query: { profileId: string; filter: BoardFilter; column?: BoardStatus },
  sort: BoardSort
) {
  const rows = await repository.boardRows({ ...query, sort: "activity" });
  const resumes = await boardOrigins(repository, rows);
  return rows
    .map((row) => openBoardRow(cipher, row, resumes.get(row.openingId) ?? null))
    .filter((row) => matchesMemoryFilter(row, query.filter))
    .sort(compareBoardRows(sort));
}

/**
 * The tracker (tracker spec): every application from its first document to
 * the outcome, with few statuses and dated events, what was sent and in-app
 * reminders.
 */
export class TrackerService {
  constructor(private readonly db: DbClient) {}

  async list(userId: string, now = new Date()): Promise<TrackedApplication[]> {
    const profile = await this.findProfile(userId);
    if (!profile) return [];
    return this.db.transaction(async (tx) => {
      const repository = new TrackerRepository(tx);
      const cipher = await getUserCipher(tx, userId);
      const rows = await repository.listApplications(profile.id);
      const next = await repository.nextEvents(
        rows.map((row) => row.application.id),
        now
      );
      const bands = await repository.latestFitBands(
        rows.map((row) => row.application.openingId)
      );
      return rows.map((row) => {
        const event = next.find(
          (item) => item.applicationId === row.application.id
        );
        return {
          ...this.summary(cipher, row),
          fitBand: bands.get(row.application.openingId) ?? null,
          nextEvent: event
            ? {
                occurredAt: event.occurredAt,
                text: open(cipher, event.encryptedText),
              }
            : null,
        };
      });
    });
  }

  /**
   * A page of the Openings page (tracker spec, “The Openings page”): every
   * analyzed opening, filtered on the server. Structured filters page by a
   * keyset in SQL (ADR 0013); a filter or sort on company, title or the
   * resume's origin decrypts and derives in memory, and the cursor carries
   * the position (ADR 0014).
   */
  async board(input: {
    userId: string;
    filter: BoardFilter;
    sort: BoardSort;
    column?: BoardStatus;
    cursor?: string | null;
    limit: number;
    now?: Date;
  }): Promise<{
    data: BoardOpening[];
    nextCursor: string | null;
    total: number;
  }> {
    const now = input.now ?? new Date();
    const profile = await this.findProfile(input.userId);
    if (!profile) return { data: [], nextCursor: null, total: 0 };
    return this.db.transaction(async (tx) => {
      const repository = new TrackerRepository(tx);
      const cipher = await getUserCipher(tx, input.userId);
      const query = {
        profileId: profile.id,
        filter: input.filter,
        column: input.column,
      };
      let page: BoardOpening[];
      let nextCursor: string | null = null;
      let total: number;
      const after = decodeCursor(input.cursor);
      if (needsMemory(input.filter, input.sort)) {
        const found = await allMatching(repository, cipher, query, input.sort);
        const offset =
          after?.keys[0] === "offset" && typeof after.keys[1] === "number"
            ? after.keys[1]
            : 0;
        const next = offset + input.limit;
        page = found.slice(offset, next);
        nextCursor =
          next < found.length
            ? encodeCursor({ keys: ["offset", next], id: "" })
            : null;
        total = found.length;
      } else {
        const sort = input.sort as Exclude<BoardSort, "company">;
        const keys = after?.keys[0] === "keyset" ? after.keys.slice(1) : null;
        const rows = await repository.boardRows({
          ...query,
          sort,
          after:
            after &&
            keys?.every(
              (key): key is string | number =>
                typeof key === "string" || typeof key === "number"
            )
              ? { keys, id: after.id }
              : null,
          // One more than shown tells whether a next page exists.
          limit: input.limit + 1,
        });
        const shown = rows.slice(0, input.limit);
        const resumes = await boardOrigins(repository, shown);
        page = shown.map((row) =>
          openBoardRow(cipher, row, resumes.get(row.openingId) ?? null)
        );
        const last = shown[shown.length - 1];
        if (rows.length > input.limit && last) {
          const sortKeys =
            sort === "sent"
              ? [last.sentKey, last.activityKey]
              : sort === "status"
                ? [last.statusRank, last.activityKey]
                : [last.activityKey];
          nextCursor = encodeCursor({
            keys: ["keyset", ...sortKeys],
            id: last.openingId,
          });
        }
        total = await repository.boardCount(query);
      }

      const events = await repository.nextEvents(
        page.flatMap((row) => (row.applicationId ? [row.applicationId] : [])),
        now
      );
      const data = page.map((row) => {
        const event = events.find(
          (item) => item.applicationId === row.applicationId
        );
        return event
          ? {
              ...row,
              nextEvent: {
                occurredAt: event.occurredAt,
                text: open(cipher, event.encryptedText),
              },
            }
          : row;
      });
      return { data, nextCursor, total };
    });
  }

  /**
   * A span of the calendar, the weeks a month's grid shows (tracker spec,
   * “Calendar”): the milestones of
   * the openings the filter matches, one marker per opening per day in the
   * viewer's time zone. Notes are decrypted for the screen only.
   */
  async calendar(input: {
    userId: string;
    filter: BoardFilter;
    from: string;
    to: string;
    timeZone: string;
    show: CalendarShow;
    now?: Date;
  }): Promise<CalendarMarker[]> {
    const now = input.now ?? new Date();
    const profile = await this.findProfile(input.userId);
    if (!profile) return [];
    const settings = await this.settingsOf(profile.id);
    return this.db.transaction(async (tx) => {
      const repository = new TrackerRepository(tx);
      const cipher = await getUserCipher(tx, input.userId);
      const openings = await allMatching(
        repository,
        cipher,
        { profileId: profile.id, filter: input.filter },
        "activity"
      );
      const applicationIds = openings.flatMap((opening) =>
        opening.applicationId ? [opening.applicationId] : []
      );
      const events = await repository.timelines(applicationIds);
      return calendarMarkers({
        openings: openings.map((opening) => ({
          openingId: opening.openingId,
          company: opening.company,
          title: opening.title,
          status: opening.status,
          addedAt: opening.addedAt,
          application:
            opening.applicationId && isApplicationStatus(opening.status)
              ? {
                  status: opening.status,
                  appliedAt: opening.appliedAt,
                  lastActivityAt: opening.lastActivityAt,
                  events: events
                    .filter(
                      (event) => event.applicationId === opening.applicationId
                    )
                    .map((event) => ({
                      kind: event.kind,
                      occurredAt: event.occurredAt,
                      text: open(cipher, event.encryptedText),
                      toStatus: event.toStatus,
                    })),
                }
              : null,
        })),
        from: input.from,
        to: input.to,
        timeZone: input.timeZone,
        show: input.show,
        settings,
        now,
      });
    });
  }

  async get(input: {
    userId: string;
    applicationId: string;
    now?: Date;
  }): Promise<ApplicationDetail> {
    const now = input.now ?? new Date();
    const profile = await this.requireProfile(input.userId);
    return this.db.transaction(async (tx) => {
      const repository = new TrackerRepository(tx);
      const row = await this.requireApplication(tx, profile.id, input);
      const cipher = await getUserCipher(tx, input.userId);
      const events = await repository.listEvents(row.application.id);
      const next = events
        .filter((event) => event.kind === "note" && event.occurredAt > now)
        .at(-1);
      const submissions = await repository.listSubmissions(row.application.id);
      const sentResume = submissions.find((s) => s.documentKind === "resume");
      const [resume] = await repository.resumeVersions(
        profile.id,
        sentResume
          ? [sentResume.versionId]
          : row.application.pickedResumeVersionId
            ? [row.application.pickedResumeVersionId]
            : []
      );
      return {
        ...this.summary(cipher, row),
        sourceDetail: open(cipher, row.application.encryptedSourceDetail),
        notes: open(cipher, row.application.encryptedNotes),
        declineReason: open(cipher, row.application.encryptedDeclineReason),
        resumeSent: resume ? versionRef(cipher, resume) : null,
        resumeSentAutomatically: Boolean(sentResume),
        nextEvent: next
          ? {
              occurredAt: next.occurredAt,
              text: open(cipher, next.encryptedText),
            }
          : null,
        events: events.map((event) => ({
          id: event.id,
          kind: event.kind,
          occurredAt: event.occurredAt,
          text: open(cipher, event.encryptedText),
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
        })),
        submissions: submissions.map(({ encryptedLabel, ...submission }) => ({
          ...submission,
          label: open(cipher, encryptedLabel),
        })),
      };
    });
  }

  /**
   * The opening's application, created if there is none: an opening can be
   * applied to, and its status moved, without any document written for it.
   */
  async ensureForOpening(input: { userId: string; openingId: string }) {
    const profile = await this.requireProfile(input.userId);
    return this.db.transaction(async (tx) => {
      const opening = await new OpeningsRepository(tx).findOpening({
        profileId: profile.id,
        openingId: input.openingId,
      });
      if (!opening) throw new TRPCError({ code: "NOT_FOUND" });
      const application = await new DocumentsRepository(
        tx
      ).findOrInsertApplication({
        profileId: profile.id,
        openingId: opening.id,
      });
      if (!application) throw new TRPCError({ code: "NOT_FOUND" });
      return { applicationId: application.id };
    });
  }

  /**
   * Moves an application to another status, recorded on its timeline.
   * "Applied" goes through markApplied, which records what was sent.
   */
  async setStatus(input: {
    userId: string;
    applicationId: string;
    status: ApplicationStatus;
    note?: string;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const row = await this.requireApplication(tx, profile.id, input);
      const { application } = row;
      if (input.status === application.status) return;
      if (!manualStatus(input.status, application.appliedAt)) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      // "Marking applied by mistake is undone by changing the status back"
      // (resume spec): nothing was sent after all.
      if (input.status === "in_preparation") {
        const repository = new TrackerRepository(tx);
        await repository.deleteSubmissions(application.id);
        await repository.updateApplication(application.id, { appliedAt: null });
      }
      const cipher = await getUserCipher(tx, input.userId);
      await this.changeStatus(tx, {
        applicationId: row.application.id,
        from: row.application.status,
        to: input.status,
        now,
        encryptedText: input.note?.trim()
          ? cipher.encrypt(input.note.trim())
          : null,
      });
    });
  }

  /**
   * "Applied" (tracker spec): records the exact snapshot of each version
   * sent (the one it had that day); the documents stay editable.
   */
  async markApplied(input: {
    userId: string;
    applicationId: string;
    versionIds: string[];
    appliedAt?: Date;
    now?: Date;
    acknowledgeWarnings?: boolean;
  }) {
    const now = input.now ?? new Date();
    const appliedAt = input.appliedAt ?? now;
    if (appliedAt > now) throw new TRPCError({ code: "BAD_REQUEST" });
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const repository = new TrackerRepository(tx);
      const row = await this.requireApplication(tx, profile.id, input);
      if (row.application.status !== "in_preparation") {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      // The snapshot each version had that day: what was sent.
      const versions = await repository.applicationVersions(
        row.application.id,
        endOfDay(appliedAt, now)
      );
      const sent = versions.filter(
        (version) =>
          input.versionIds.includes(version.versionId) && version.snapshotId
      );
      if (sent.length !== input.versionIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      // Sending is the document leaving the platform: a resume with
      // coverage findings is refused (resume spec, "Coverage review").
      const documents = new DocumentsRepository(tx);
      const cipher = await getUserCipher(tx, input.userId);
      const contexts = new FrozenContexts(tx, cipher, profile.id);
      for (const row of sent) {
        const version = await documents.findVersion(row.versionId);
        const document =
          version && (await documents.findDocument(version.documentId));
        const snapshot = await documents.findSnapshot(row.snapshotId);
        if (!version || !document || !snapshot) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await assertSendable({
          db: tx,
          cipher,
          profileId: profile.id,
          document,
          version,
          snapshot,
          contexts,
          acknowledgeWarnings: input.acknowledgeWarnings,
        });
      }
      const changed = await this.changeStatus(tx, {
        applicationId: row.application.id,
        from: row.application.status,
        to: "applied",
        now,
        occurredAt: appliedAt,
        appliedAt,
      });
      if (!changed) throw new TRPCError({ code: "CONFLICT" });
      await repository.insertSubmissions(
        sent.map((version) => ({
          applicationId: row.application.id,
          versionId: version.versionId,
          snapshotId: version.snapshotId,
        }))
      );
    });
  }

  /**
   * A dated event ("HR interview on Nov 20"). Anything happening reopens
   * an application closed as "No response" (tracker spec).
   */
  async addEvent(input: {
    userId: string;
    applicationId: string;
    occurredAt: Date;
    text: string;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const repository = new TrackerRepository(tx);
      const row = await this.requireApplication(tx, profile.id, input);
      const cipher = await getUserCipher(tx, input.userId);
      await repository.insertEvent({
        applicationId: row.application.id,
        kind: "note",
        occurredAt: input.occurredAt,
        encryptedText: cipher.encrypt(input.text.trim()),
      });
      if (row.application.status === "no_response") {
        const before =
          (await repository.statusBeforeNoResponse(row.application.id)) ??
          "in_process";
        await this.changeStatus(tx, {
          applicationId: row.application.id,
          from: "no_response",
          to: before,
          now,
          activityAt: latest(now, input.occurredAt),
        });
        return;
      }
      await repository.updateApplication(row.application.id, {
        lastActivityAt: latest(now, input.occurredAt),
      });
    });
  }

  async deleteEvent(input: {
    userId: string;
    applicationId: string;
    eventId: string;
  }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const row = await this.requireApplication(tx, profile.id, input);
      const deleted = await new TrackerRepository(tx).deleteEvent({
        applicationId: row.application.id,
        eventId: input.eventId,
      });
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND" });
    });
  }

  /**
   * The method's fields on an application (tracker spec): `undefined` keeps
   * a field, `null` clears it. The resume sent is only picked by hand when none
   * was recorded; one sent from StoryToRole records itself.
   */
  async updateDetails(input: {
    userId: string;
    applicationId: string;
    source?: ApplicationSource | null;
    sourceDetail?: string | null;
    resumeVersionId?: string | null;
    nextStep?: string | null;
    notes?: string | null;
    declineReason?: string | null;
  }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const repository = new TrackerRepository(tx);
      const row = await this.requireApplication(tx, profile.id, input);
      const cipher = await getUserCipher(tx, input.userId);
      if (input.resumeVersionId) {
        const owned = await repository.resumeVersions(profile.id, [
          input.resumeVersionId,
        ]);
        // Sent from StoryToRole, it records itself; applied without a
        // resume recorded, it is picked by hand.
        const submissions = await repository.listSubmissions(
          row.application.id
        );
        if (
          submissions.length > 0 ||
          owned.length === 0 ||
          row.application.status === "in_preparation"
        ) {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }
      }
      const text = (value: string | null | undefined) =>
        value === undefined ? undefined : seal(cipher, value);
      const changes = {
        source: input.source,
        encryptedSourceDetail: text(input.sourceDetail),
        pickedResumeVersionId: input.resumeVersionId,
        encryptedNextStep: text(input.nextStep),
        encryptedNotes: text(input.notes),
        encryptedDeclineReason: text(input.declineReason),
      };
      await repository.updateApplication(
        row.application.id,
        Object.fromEntries(
          Object.entries(changes).filter(([, value]) => value !== undefined)
        )
      );
    });
  }

  /** The resume versions an application with nothing recorded can say it was sent with. */
  async resumeVersionOptions(userId: string): Promise<ResumeVersionRef[]> {
    const profile = await this.findProfile(userId);
    if (!profile) return [];
    const cipher = await getUserCipher(this.db, userId);
    const rows = await new TrackerRepository(this.db).resumeVersions(
      profile.id
    );
    return rows.map((row) => versionRef(cipher, row));
  }

  /**
   * The metrics over the applications sent in a period (tracker spec,
   * "Metrics"): from structured fields only, never free text or an AI.
   */
  async metrics(input: { userId: string; period: MetricsPeriod; now?: Date }) {
    const now = input.now ?? new Date();
    const profile = await this.findProfile(input.userId);
    const empty = computeMetrics({ rows: [], period: input.period, now });
    if (!profile) return empty;
    const repository = new TrackerRepository(this.db);
    const data = await repository.metricsInputs(profile.id);
    if (data.applications.length === 0) return empty;
    const cipher = await getUserCipher(this.db, input.userId);
    const versionIds = [
      ...new Set([
        ...data.submissions.map((s) => s.versionId),
        ...data.applications.flatMap((a) =>
          a.pickedResumeVersionId ? [a.pickedResumeVersionId] : []
        ),
      ]),
    ];
    const versions = new Map(
      (await repository.resumeVersions(profile.id, versionIds)).map((row) => [
        row.versionId,
        versionRef(cipher, row),
      ])
    );
    const origins = await repository.versionOrigins(versionIds);
    const libraryOf = new Map(
      origins.libraries.map((l) => [
        l.versionId,
        {
          documentId: l.documentId,
          label:
            open(cipher, l.encryptedFocus) ?? open(cipher, l.encryptedLabel),
        },
      ])
    );
    // The rating of the kept round of the latest judged snapshot, as the
    // review view reads it.
    const ratingOf = (versionId: string) => {
      const rounds = origins.rounds.filter((r) => r.versionId === versionId);
      if (rounds.length === 0) return null;
      const judged = (r: (typeof rounds)[number]) =>
        r.snapshotId ?? r.generationSnapshotId;
      const latest = judged(rounds[rounds.length - 1]);
      const group = rounds.filter((r) => judged(r) === latest);
      return (group.find((r) => r.kept) ?? group[group.length - 1]).rating;
    };
    const sentResumeOf = (versionId: string | undefined) => {
      if (!versionId) return null;
      const libraryVersionId = origins.versions.find(
        (v) => v.versionId === versionId
      )?.libraryVersionId;
      return {
        library: libraryVersionId
          ? (libraryOf.get(libraryVersionId) ?? null)
          : null,
        generated: !libraryVersionId,
        rating: ratingOf(versionId),
      };
    };
    const rows: MetricsRow[] = data.applications.map((application) => {
      const sent = data.submissions
        .filter((s) => s.applicationId === application.id)
        .map((s) => s.versionId);
      const resumeIds =
        sent.length > 0
          ? sent
          : application.pickedResumeVersionId
            ? [application.pickedResumeVersionId]
            : [];
      return {
        appliedAt: application.appliedAt!,
        source: application.source,
        status: application.status,
        changes: data.changes.filter((c) => c.applicationId === application.id),
        resumes: resumeIds.flatMap((id) => versions.get(id) ?? []),
        sentResume: sentResumeOf(resumeIds[resumeIds.length - 1]),
        // Rows come newest first: the first is the latest check.
        fitBand:
          data.bands.find((b) => b.openingId === application.openingId)?.band ??
          null,
      };
    });
    return computeMetrics({ rows, period: input.period, now });
  }

  /**
   * The user's decline reason becomes a discard rule in the job
   * preferences, published at once (only that line), like excluding a
   * company.
   */
  async addDeclineReasonAsRule(input: {
    userId: string;
    applicationId: string;
    language: ProfileLanguage;
  }) {
    const profile = await this.requireProfile(input.userId);
    const row = await this.requireApplication(this.db, profile.id, input);
    const cipher = await getUserCipher(this.db, input.userId);
    const reason = open(cipher, row.application.encryptedDeclineReason);
    if (!reason) throw new TRPCError({ code: "PRECONDITION_FAILED" });
    return new ProfileService(this.db).addDiscardRule({
      userId: input.userId,
      text: reason,
      language: input.language,
    });
  }

  /** Excludes the application's company in the job preferences. */
  async excludeCompany(input: {
    userId: string;
    applicationId: string;
    date: string;
    language: ProfileLanguage;
  }) {
    const profile = await this.requireProfile(input.userId);
    const row = await this.requireApplication(this.db, profile.id, input);
    return new OpeningsService(this.db).excludeCompany({
      userId: input.userId,
      openingId: row.application.openingId,
      date: input.date,
      language: input.language,
    });
  }

  async reminders(userId: string, now = new Date()): Promise<Reminder[]> {
    const profile = await this.findProfile(userId);
    if (!profile) return [];
    const repository = new TrackerRepository(this.db);
    return computeReminders({
      now,
      settings: await this.settingsOf(profile.id),
      applications: await this.list(userId, now),
      dismissed: await repository.listDismissed(profile.id),
    });
  }

  async dismissReminder(input: { userId: string; reminderKey: string }) {
    const profile = await this.requireProfile(input.userId);
    await new TrackerRepository(this.db).dismiss(profile.id, input.reminderKey);
  }

  async getSettings(userId: string): Promise<TrackerSettings> {
    const profile = await this.findProfile(userId);
    return profile ? this.settingsOf(profile.id) : defaultSettings;
  }

  async updateSettings(input: { userId: string } & TrackerSettings) {
    const profile = await this.requireProfile(input.userId);
    await new TrackerRepository(this.db).upsertSettings({
      profileId: profile.id,
      remindersEnabled: input.remindersEnabled,
      followUpDays: input.followUpDays,
      noResponseDays: input.noResponseDays,
    });
  }

  /**
   * "No response" (tracker spec): closes what has waited on the company,
   * with nothing happening, longer than the owner's setting.
   */
  async closeUnanswered(now = new Date()) {
    const stale = await new TrackerRepository(this.db).unanswered(now);
    let closed = 0;
    for (const application of stale) {
      const changed = await this.db.transaction((tx) =>
        this.changeStatus(tx, {
          applicationId: application.id,
          from: application.status,
          to: "no_response",
          now,
          // Something that happened meanwhile keeps it open.
          quietBefore: new Date(
            now.getTime() - application.noResponseDays * day
          ),
        })
      );
      if (changed) closed += 1;
    }
    return { closed };
  }

  /**
   * Moves the status if it is still `from` and records it on the timeline;
   * a concurrent change wins. Whether it moved.
   */
  private async changeStatus(
    tx: DbClient,
    input: {
      applicationId: string;
      from: ApplicationStatus;
      to: ApplicationStatus;
      now: Date;
      occurredAt?: Date;
      encryptedText?: string | null;
      appliedAt?: Date;
      // When activity counts from (a scheduled event ahead keeps it open).
      activityAt?: Date;
      quietBefore?: Date;
    }
  ) {
    const repository = new TrackerRepository(tx);
    const changed = await repository.transitionStatus({
      applicationId: input.applicationId,
      from: input.from,
      quietBefore: input.quietBefore,
      changes: {
        status: input.to,
        statusChangedAt: input.now,
        // Closing isn't activity: reopening counts from the event that did it.
        ...(closedStatuses.includes(input.to)
          ? {}
          : {
              lastActivityAt: input.activityAt ?? input.occurredAt ?? input.now,
            }),
        ...(input.appliedAt ? { appliedAt: input.appliedAt } : {}),
      },
    });
    if (!changed) return false;
    await repository.insertEvent({
      applicationId: input.applicationId,
      kind: "status_change",
      occurredAt: input.occurredAt ?? input.now,
      fromStatus: input.from,
      toStatus: input.to,
      encryptedText: input.encryptedText ?? null,
    });
    return true;
  }

  private summary(
    cipher: UserCipher,
    row: Awaited<ReturnType<TrackerRepository["findApplication"]>> & object
  ) {
    return {
      id: row.application.id,
      openingId: row.application.openingId,
      company: open(cipher, row.encryptedCompany),
      title: open(cipher, row.encryptedTitle),
      status: row.application.status,
      statusChangedAt: row.application.statusChangedAt,
      lastActivityAt: row.application.lastActivityAt,
      appliedAt: row.application.appliedAt,
      source: row.application.source,
      nextStep: open(cipher, row.application.encryptedNextStep),
      fitBand: null,
      nextEvent: null,
    };
  }

  private async settingsOf(profileId: string): Promise<TrackerSettings> {
    const row = await new TrackerRepository(this.db).findSettings(profileId);
    return row
      ? {
          remindersEnabled: row.remindersEnabled,
          followUpDays: row.followUpDays,
          noResponseDays: row.noResponseDays,
        }
      : defaultSettings;
  }

  private findProfile(userId: string) {
    return new CareerRepository(this.db).findProfileByUserId(userId);
  }

  private async requireProfile(userId: string) {
    const profile = await this.findProfile(userId);
    if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
    return profile;
  }

  private async requireApplication(
    tx: DbClient,
    profileId: string,
    input: { applicationId: string }
  ) {
    const row = await new TrackerRepository(tx).findApplication({
      profileId,
      applicationId: input.applicationId,
    });
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }
}
