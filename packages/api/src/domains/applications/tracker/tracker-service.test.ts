import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { DocumentsRepository } from "@repo/api/domains/documents/documents-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import { OpeningsService } from "@repo/api/domains/openings/openings-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { TrackerService } from "./tracker-service";

vi.mock("@repo/common/env/web.env", () => ({
  env: {
    ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}`,
  },
}));
vi.mock("@repo/api/tools/trigger/trigger-client", () => ({
  triggerClient: { trigger: vi.fn() },
}));

const day = 24 * 3600 * 1000;
const now = new Date("2026-11-20T12:00:00Z");

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const career = new CareerRepository(db);
  await career.insertProfileIfMissing({
    userId: user.id,
    interviewLanguage: "en-US",
  });
  const profile = await career.findProfileByUserId(user.id);
  const tracker = new TrackerService(db);
  const external = (input: { appliedAt?: Date } = {}) =>
    tracker.createExternal({
      userId: user.id,
      company: "Globex",
      title: "Platform Engineer",
      link: "https://example.com/jobs/1",
      status: "applied",
      appliedAt: input.appliedAt ?? now,
      now,
    });
  return { db, user, profile, tracker, external };
}

describe("tracker", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("registers an external application without documents or credits", async () => {
    const ctx = await setup();
    const { applicationId, openingId } = await ctx.external();

    const [application] = await ctx.tracker.list(ctx.user.id, now);
    expect(application).toMatchObject({
      id: applicationId,
      company: "Globex",
      title: "Platform Engineer",
      status: "applied",
      external: true,
    });
    const openings = await new OpeningsService(ctx.db).list(ctx.user.id);
    expect(openings[0]).toMatchObject({
      id: openingId,
      status: "external",
      applicationStatus: "applied",
    });
  });

  it("stops being external once a document exists, not when one starts", async () => {
    const ctx = await setup();
    const { openingId } = await ctx.external();
    const documents = new DocumentsRepository(ctx.db);
    const application = await documents.findOrInsertApplication({
      profileId: ctx.profile.id,
      openingId,
    });
    expect((await ctx.tracker.list(ctx.user.id, now))[0].external).toBe(true);

    const document = await documents.findOrInsertApplicationDocument({
      profileId: ctx.profile.id,
      applicationId: application.id,
      kind: "resume",
    });
    const version = await documents.insertVersion({
      documentId: document.id,
      language: "en-US",
    });
    await documents.insertSnapshot({
      versionId: version.id,
      sequence: 1,
      origin: "generated",
      author: "ai",
      encryptedContent: "x",
    });

    expect((await ctx.tracker.list(ctx.user.id, now))[0].external).toBe(false);
  });

  it("never sets No response by hand", async () => {
    const ctx = await setup();
    const { applicationId } = await ctx.external();
    await expect(
      ctx.tracker.setStatus({
        userId: ctx.user.id,
        applicationId,
        status: "no_response",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps an application with an interview booked ahead open", async () => {
    const ctx = await setup();
    const { applicationId } = await ctx.external({
      appliedAt: new Date(now.getTime() - 20 * day),
    });
    await ctx.tracker.addEvent({
      userId: ctx.user.id,
      applicationId,
      occurredAt: new Date(now.getTime() + 25 * day),
      text: "Final interview",
      now,
    });

    const later = new Date(now.getTime() + 40 * day);
    expect(await ctx.tracker.closeUnanswered(later)).toEqual({ closed: 0 });
  });

  it("records the exact snapshot of each version sent", async () => {
    const ctx = await setup();
    const { openingId } = await ctx.external();
    const documents = new DocumentsRepository(ctx.db);
    const application = await documents.findOrInsertApplication({
      profileId: ctx.profile.id,
      openingId,
    });
    await ctx.tracker.setStatus({
      userId: ctx.user.id,
      applicationId: application.id,
      status: "in_preparation",
      now,
    });
    const document = await documents.findOrInsertApplicationDocument({
      profileId: ctx.profile.id,
      applicationId: application.id,
      kind: "resume",
    });
    const version = await documents.insertVersion({
      documentId: document.id,
      language: "en-US",
    });
    // Sending reads the resume: an empty one has nothing to find.
    const cipher = await getUserCipher(ctx.db, ctx.user.id);
    const encryptedContent = cipher.encrypt(
      JSON.stringify({
        kind: "resume",
        header: { name: "", titleLine: "", contacts: [], city: null },
        sections: [],
      })
    );
    const snapshot = await documents.insertSnapshot({
      versionId: version.id,
      sequence: 1,
      origin: "generated",
      author: "ai",
      encryptedContent,
    });

    await expect(
      ctx.tracker.setStatus({
        userId: ctx.user.id,
        applicationId: application.id,
        status: "applied",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await ctx.tracker.markApplied({
      userId: ctx.user.id,
      applicationId: application.id,
      versionIds: [version.id],
      now,
    });
    // Applied already: it can't be marked again.
    await expect(
      ctx.tracker.markApplied({
        userId: ctx.user.id,
        applicationId: application.id,
        versionIds: [version.id],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Editing afterwards adds a snapshot; the sent one stays recorded.
    await documents.insertSnapshot({
      versionId: version.id,
      sequence: 2,
      origin: "edited",
      author: "user",
      encryptedContent,
    });

    const detail = await ctx.tracker.get({
      userId: ctx.user.id,
      applicationId: application.id,
    });
    expect(detail.status).toBe("applied");
    expect(detail.submissions).toEqual([
      expect.objectContaining({
        versionId: version.id,
        snapshotId: snapshot.id,
        documentKind: "resume",
      }),
    ]);

    // Marked by mistake: going back to preparation forgets what was sent.
    await ctx.tracker.setStatus({
      userId: ctx.user.id,
      applicationId: application.id,
      status: "in_preparation",
    });
    const undone = await ctx.tracker.get({
      userId: ctx.user.id,
      applicationId: application.id,
    });
    expect(undone.submissions).toEqual([]);
    expect(undone.appliedAt).toBeNull();
  });

  it("closes as No response after the set days and reopens with any event", async () => {
    const ctx = await setup();
    const { applicationId } = await ctx.external({
      appliedAt: new Date(now.getTime() - 40 * day),
    });
    await ctx.tracker.setStatus({
      userId: ctx.user.id,
      applicationId,
      status: "in_process",
      now: new Date(now.getTime() - 35 * day),
    });

    expect(await ctx.tracker.closeUnanswered(now)).toEqual({ closed: 1 });
    expect((await ctx.tracker.list(ctx.user.id, now))[0].status).toBe(
      "no_response"
    );

    await ctx.tracker.addEvent({
      userId: ctx.user.id,
      applicationId,
      occurredAt: now,
      text: "Recruiter called back",
      now,
    });
    const detail = await ctx.tracker.get({
      userId: ctx.user.id,
      applicationId,
    });
    expect(detail.status).toBe("in_process");
    expect(detail.events).toContainEqual(
      expect.objectContaining({
        fromStatus: "no_response",
        toStatus: "in_process",
      })
    );
  });

  it("reminds of a follow-up and an interview tomorrow, and forgets a dismissed one", async () => {
    const ctx = await setup();
    const { applicationId } = await ctx.external({
      appliedAt: new Date(now.getTime() - 12 * day),
    });
    let reminders = await ctx.tracker.reminders(ctx.user.id, now);
    expect(reminders.map((reminder) => reminder.kind)).toEqual(["follow_up"]);

    await ctx.tracker.dismissReminder({
      userId: ctx.user.id,
      reminderKey: reminders[0].key,
    });
    await ctx.tracker.addEvent({
      userId: ctx.user.id,
      applicationId,
      occurredAt: new Date(now.getTime() + 18 * 3600 * 1000),
      text: "HR interview",
      now,
    });

    reminders = await ctx.tracker.reminders(ctx.user.id, now);
    expect(reminders).toEqual([
      expect.objectContaining({ kind: "upcoming_event", text: "HR interview" }),
    ]);
  });

  it("keeps other users' applications out of reach", async () => {
    const ctx = await setup();
    const { applicationId } = await ctx.external();
    const other = await createTestUser("grace@example.com");
    await new CareerRepository(ctx.db).insertProfileIfMissing({
      userId: other.id,
      interviewLanguage: "en-US",
    });

    await expect(
      ctx.tracker.get({ userId: other.id, applicationId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  describe("without a resume or letter", () => {
    async function bareOpening() {
      const ctx = await setup();
      const opening = await new OpeningsRepository(ctx.db).insertOpening({
        profileId: ctx.profile.id,
        kind: "posted",
        status: "analyzed",
      });
      return { ...ctx, openingId: opening.id };
    }

    it("marks an opening applied with no documents, and tracks it", async () => {
      const ctx = await bareOpening();
      const { applicationId } = await ctx.tracker.ensureForOpening({
        userId: ctx.user.id,
        openingId: ctx.openingId,
      });
      // Calling again finds the same application.
      expect(
        await ctx.tracker.ensureForOpening({
          userId: ctx.user.id,
          openingId: ctx.openingId,
        })
      ).toEqual({ applicationId });

      await ctx.tracker.markApplied({
        userId: ctx.user.id,
        applicationId,
        versionIds: [],
        now,
      });

      const detail = await ctx.tracker.get({
        userId: ctx.user.id,
        applicationId,
        now,
      });
      expect(detail).toMatchObject({ status: "applied", resumeSent: null });
      expect(detail.submissions).toEqual([]);
      const list = await ctx.tracker.list(ctx.user.id, now);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: applicationId, status: "applied" });
      const metrics = await ctx.tracker.metrics({
        userId: ctx.user.id,
        period: "30d",
        now,
      });
      expect(metrics.sent).toBe(1);
      expect(metrics.byScore).toEqual([
        { band: "none", sent: 1, responded: 0 },
      ]);
    });

    it("moves the status without any document", async () => {
      const ctx = await bareOpening();
      const { applicationId } = await ctx.tracker.ensureForOpening({
        userId: ctx.user.id,
        openingId: ctx.openingId,
      });
      await ctx.tracker.setStatus({
        userId: ctx.user.id,
        applicationId,
        status: "in_process",
        now,
      });
      const detail = await ctx.tracker.get({
        userId: ctx.user.id,
        applicationId,
        now,
      });
      expect(detail.status).toBe("in_process");
      expect(detail.submissions).toEqual([]);
    });

    it("does not give another user's opening an application", async () => {
      const ctx = await bareOpening();
      const other = await createTestUser("grace@example.com");
      await new CareerRepository(ctx.db).insertProfileIfMissing({
        userId: other.id,
        interviewLanguage: "en-US",
      });
      await expect(
        ctx.tracker.ensureForOpening({
          userId: other.id,
          openingId: ctx.openingId,
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
