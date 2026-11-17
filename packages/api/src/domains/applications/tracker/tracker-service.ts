import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { assertSendable } from "@repo/api/domains/documents/coverage-review/snapshot-coverage";
import { DocumentsRepository } from "@repo/api/domains/documents/documents-repository";
import {
  getUserCipher,
  type UserCipher,
} from "@repo/api/domains/encryption/user-cipher";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { DbClient } from "@repo/api/tools/db-client";

import { type ApplicationStatus, closedStatuses } from "../schemas/application";
import type {
  ApplicationDetail,
  Reminder,
  TrackedApplication,
  TrackerSettings,
} from "../schemas/tracker";
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

/** What an external application can start as: it was already sent. */
const externalStatuses: ApplicationStatus[] = [
  "applied",
  "in_process",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
];

/**
 * Whether the user may move an application to a status by hand: "No
 * response" is only set by time (tracker spec), and "Applied" with
 * documents goes through markApplied, which records what was sent.
 */
function manualStatus(
  application: { external: boolean },
  status: ApplicationStatus
) {
  if (status === "no_response") return false;
  if (status === "applied") return application.external;
  return true;
}

const defaultSettings: TrackerSettings = {
  remindersEnabled: true,
  followUpDays: 10,
  noResponseDays: 30,
};

const open = (cipher: UserCipher, value: string | null) =>
  value ? cipher.decrypt(value) : null;

/**
 * The tracker (tracker spec): every application from its first document to
 * the outcome, with few statuses and dated events, what was sent, external
 * applications and in-app reminders.
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
      return rows.map((row) => {
        const event = next.find(
          (item) => item.applicationId === row.application.id
        );
        return {
          ...this.summary(cipher, row),
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
      return {
        ...this.summary(cipher, row),
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
        submissions: (await repository.listSubmissions(row.application.id)).map(
          ({ encryptedLabel, ...submission }) => ({
            ...submission,
            label: open(cipher, encryptedLabel),
          })
        ),
      };
    });
  }

  /**
   * Moves an application to another status, recorded on its timeline.
   * "Applied" goes through markApplied (it records what was sent), except
   * for an external application, which has no documents.
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
      if (!manualStatus(application, input.status)) {
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
        appliedAt:
          input.status === "applied"
            ? (row.application.appliedAt ?? now)
            : undefined,
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
      if (sent.length !== input.versionIds.length || sent.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      // Sending is the document leaving the platform: a resume with
      // coverage findings is refused (resume spec, "Coverage review").
      const documents = new DocumentsRepository(tx);
      const cipher = await getUserCipher(tx, input.userId);
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
   * An application made outside StoryToRole (tracker spec): company,
   * title, link and optionally the description; no documents, no credits.
   */
  async createExternal(input: {
    userId: string;
    company: string;
    title: string;
    link: string;
    description?: string;
    status: ApplicationStatus;
    appliedAt?: Date;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const appliedAt = input.appliedAt ?? now;
    if (appliedAt > now || !externalStatuses.includes(input.status)) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }
    const profile = await this.requireProfile(input.userId);
    return this.db.transaction(async (tx) => {
      const cipher = await getUserCipher(tx, input.userId);
      const seal = (value?: string) =>
        value?.trim() ? cipher.encrypt(value.trim()) : null;
      const opening = await new OpeningsRepository(tx).insertOpening({
        profileId: profile.id,
        kind: "posted",
        status: "external",
        encryptedCompany: seal(input.company),
        encryptedTitle: seal(input.title),
        encryptedSourceUrl: seal(input.link),
        encryptedDescription: seal(input.description),
      });
      const repository = new TrackerRepository(tx);
      const application = await repository.insertApplication({
        profileId: profile.id,
        openingId: opening.id,
        external: true,
        status: input.status,
        statusChangedAt: now,
        lastActivityAt: appliedAt,
        appliedAt,
      });
      await repository.insertEvent({
        applicationId: application.id,
        kind: "status_change",
        occurredAt: appliedAt,
        toStatus: input.status,
      });
      return { applicationId: application.id, openingId: opening.id };
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
      external: row.application.external,
      statusChangedAt: row.application.statusChangedAt,
      lastActivityAt: row.application.lastActivityAt,
      appliedAt: row.application.appliedAt,
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
