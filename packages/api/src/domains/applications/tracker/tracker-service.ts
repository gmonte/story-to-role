import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
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
      if (input.status === "applied" && !row.application.external) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      if (input.status === row.application.status) return;
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
   * sent, as it is now; the documents stay editable.
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
      const versions = await repository.applicationVersions(row.application.id);
      const sent = versions.filter(
        (version) =>
          input.versionIds.includes(version.versionId) && version.snapshotId
      );
      if (sent.length !== input.versionIds.length || sent.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      await repository.insertSubmissions(
        sent.map((version) => ({
          applicationId: row.application.id,
          versionId: version.versionId,
          snapshotId: version.snapshotId,
        }))
      );
      await this.changeStatus(tx, {
        applicationId: row.application.id,
        from: row.application.status,
        to: "applied",
        now,
        occurredAt: appliedAt,
        appliedAt,
      });
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
        });
        return;
      }
      await repository.updateApplication(row.application.id, {
        lastActivityAt: now,
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
    link?: string;
    description?: string;
    status: ApplicationStatus;
    appliedAt?: Date;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const appliedAt = input.appliedAt ?? now;
    if (appliedAt > now || input.status === "in_preparation") {
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
    for (const application of stale) {
      await this.db.transaction((tx) =>
        this.changeStatus(tx, {
          applicationId: application.id,
          from: application.status,
          to: "no_response",
          now,
        })
      );
    }
    return { closed: stale.length };
  }

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
    }
  ) {
    const repository = new TrackerRepository(tx);
    await repository.insertEvent({
      applicationId: input.applicationId,
      kind: "status_change",
      occurredAt: input.occurredAt ?? input.now,
      fromStatus: input.from,
      toStatus: input.to,
      encryptedText: input.encryptedText ?? null,
    });
    await repository.updateApplication(input.applicationId, {
      status: input.to,
      statusChangedAt: input.now,
      // Closing isn't activity: reopening counts from the event that did it.
      ...(closedStatuses.includes(input.to)
        ? {}
        : { lastActivityAt: input.occurredAt ?? input.now }),
      ...(input.appliedAt ? { appliedAt: input.appliedAt } : {}),
    });
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
