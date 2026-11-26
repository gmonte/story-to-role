import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import {
  documentsTable,
  generationsTable,
  reviewRoundsTable,
} from "@repo/api/domains/documents/db/documents-tables";
import { DocumentsRepository } from "@repo/api/domains/documents/documents-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { fitChecksTable } from "@repo/api/domains/openings/db/openings-tables";
import { ProfileService } from "@repo/api/domains/profile/profile-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import { appliedOpening } from "@repo/api/test/applied-opening";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { applicationsTable } from "../db/applications-tables";
import { computeMetrics, type MetricsRow } from "./metrics";
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
const ago = (days: number) => new Date(now.getTime() - days * day);

describe("metrics math", () => {
  const version = (versionId: string) => ({
    versionId,
    label: versionId,
    language: "en-US" as const,
  });
  const row = (over: Partial<MetricsRow>): MetricsRow => ({
    appliedAt: ago(10),
    source: "linkedin",
    status: "applied",
    changes: [],
    resumes: [],
    sentResume: null,
    fitBand: null,
    ...over,
  });
  const change = (
    toStatus: MetricsRow["status"],
    daysAfter: number,
    appliedAt = ago(10)
  ) => ({
    fromStatus: "applied" as const,
    toStatus,
    occurredAt: new Date(appliedAt.getTime() + daysAfter * day),
  });

  const a = "00000000-0000-4000-8000-00000000000a";
  const b = "00000000-0000-4000-8000-00000000000b";

  it("counts responses, interviews, rates inputs, median and high fit", () => {
    const rows = [
      row({
        resumes: [version(a)],
        status: "in_process",
        changes: [change("in_process", 2)],
        fitBand: "high",
      }),
      row({
        resumes: [version(a)],
        status: "rejected",
        changes: [change("rejected", 6)],
        fitBand: "high",
      }),
      row({ resumes: [version(b)], source: "referral" }),
      // The user gave up and silence are not responses.
      row({
        resumes: [version(b)],
        source: "referral",
        status: "withdrawn",
        changes: [change("withdrawn", 1)],
      }),
      row({ status: "no_response", source: null }),
      // Before the period.
      row({ appliedAt: ago(100), status: "offer", changes: [] }),
    ];

    const month = computeMetrics({ rows, period: "30d", now });
    expect(month).toMatchObject({
      sent: 5,
      responded: 2,
      interviews: 1,
      medianDaysToResponse: 4,
      daysToResponseSample: 2,
      highFit: { total: 2, interviews: 1 },
    });
    expect(month.byFit).toEqual([
      { band: null, sent: 3, responded: 0 },
      { band: "high", sent: 2, responded: 2 },
    ]);
    expect(month.bySource).toEqual([
      { source: "linkedin", sent: 2, responded: 2 },
      { source: "referral", sent: 2, responded: 0 },
      { source: null, sent: 1, responded: 0 },
    ]);

    // All time includes the old offer, whose date of answer is unknown.
    const all = computeMetrics({ rows, period: "all", now });
    expect(all).toMatchObject({ sent: 6, responded: 3, interviews: 2 });
    expect(all.daysToResponseSample).toBe(2);
  });

  it("has no median without dated responses", () => {
    expect(
      computeMetrics({ rows: [row({})], period: "all", now })
    ).toMatchObject({ medianDaysToResponse: null, daysToResponseSample: 0 });
  });

  it("pools openings by resume origin, score band and fit band", () => {
    const lib = "00000000-0000-4000-8000-0000000000c1";
    const sent = (
      rating: number | null,
      library: { documentId: string; label: string | null } | null = null
    ) => ({ library, generated: !library, rating });
    const rows = [
      row({ sentResume: sent(9), status: "offer", fitBand: "high" }),
      row({ sentResume: sent(7), fitBand: "medium" }),
      row({
        sentResume: sent(8, { documentId: lib, label: "Backend" }),
        status: "rejected",
        fitBand: "medium",
      }),
      row({ sentResume: sent(null, { documentId: lib, label: "Backend" }) }),
      row({ sentResume: null }),
    ];
    const metrics = computeMetrics({ rows, period: "all", now });
    expect(metrics.byOrigin).toEqual([
      {
        origin: "generated",
        libraryDocumentId: null,
        label: null,
        sent: 2,
        responded: 1,
      },
      {
        origin: "library",
        libraryDocumentId: lib,
        label: "Backend",
        sent: 2,
        responded: 1,
      },
      {
        origin: "unknown",
        libraryDocumentId: null,
        label: null,
        sent: 1,
        responded: 0,
      },
    ]);
    expect(metrics.byScore).toEqual([
      { band: "reached", sent: 2, responded: 2 },
      { band: "none", sent: 2, responded: 0 },
      { band: "below", sent: 1, responded: 0 },
    ]);
    expect(metrics.byFit).toEqual([
      { band: "medium", sent: 2, responded: 1 },
      { band: null, sent: 2, responded: 0 },
      { band: "high", sent: 1, responded: 1 },
    ]);
  });
});

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
  // An opening applied to with nothing from StoryToRole.
  const external = (appliedAt = now) =>
    appliedOpening({
      userId: user.id,
      profileId: profile.id,
      appliedAt,
      now,
    });
  return { db, user, profile, tracker, external };
}

describe("tracker, the method's fields", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("records the version sent from StoryToRole and the metrics count it", async () => {
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
    const cipher = await getUserCipher(ctx.db, ctx.user.id);
    await documents.insertSnapshot({
      versionId: version.id,
      sequence: 1,
      origin: "generated",
      author: "ai",
      encryptedContent: cipher.encrypt(
        JSON.stringify({
          kind: "resume",
          header: { name: "", titleLine: "", contacts: [], city: null },
          sections: [],
        })
      ),
    });
    await ctx.tracker.updateDetails({
      userId: ctx.user.id,
      applicationId: application.id,
      source: "linkedin",
    });
    await ctx.tracker.markApplied({
      userId: ctx.user.id,
      applicationId: application.id,
      versionIds: [version.id],
      appliedAt: ago(5),
      now,
    });
    await ctx.tracker.setStatus({
      userId: ctx.user.id,
      applicationId: application.id,
      status: "in_process",
      now: ago(2),
    });

    const detail = await ctx.tracker.get({
      userId: ctx.user.id,
      applicationId: application.id,
    });
    expect(detail.resumeSent).toMatchObject({ versionId: version.id });
    expect(detail.resumeSentAutomatically).toBe(true);

    const metrics = await ctx.tracker.metrics({
      userId: ctx.user.id,
      period: "30d",
      now,
    });
    expect(metrics).toMatchObject({
      sent: 1,
      responded: 1,
      interviews: 1,
      bySource: [{ source: "linkedin", sent: 1, responded: 1 }],
    });
    expect(metrics.byOrigin).toEqual([
      expect.objectContaining({ origin: "generated", sent: 1, responded: 1 }),
    ]);
    expect(metrics.byScore).toEqual([{ band: "none", sent: 1, responded: 1 }]);
    expect(metrics.byFit).toEqual([{ band: null, sent: 1, responded: 1 }]);
    expect(metrics.medianDaysToResponse).toBeCloseTo(3, 0);
  });

  it("groups the metrics by resume origin, score band and fit band", async () => {
    const ctx = await setup();
    const documents = new DocumentsRepository(ctx.db);
    const cipher = await getUserCipher(ctx.db, ctx.user.id);
    const [library] = await ctx.db
      .insert(documentsTable)
      .values({
        profileId: ctx.profile.id,
        kind: "resume",
        encryptedFocus: cipher.encrypt("Backend roles"),
      })
      .returning();
    const libraryVersion = await documents.insertVersion({
      documentId: library.id,
      language: "en-US",
    });

    // Applies with a resume written for the opening, rated 9, high fit.
    const first = await ctx.external();
    const firstApplication = await documents.findOrInsertApplication({
      profileId: ctx.profile.id,
      openingId: first.openingId,
    });
    const firstDocument = await documents.findOrInsertApplicationDocument({
      profileId: ctx.profile.id,
      applicationId: firstApplication.id,
      kind: "resume",
    });
    const generated = await documents.insertVersion({
      documentId: firstDocument.id,
      language: "en-US",
    });
    const [generation] = await ctx.db
      .insert(generationsTable)
      .values({
        profileId: ctx.profile.id,
        documentId: firstDocument.id,
        versionId: generated.id,
        language: "en-US",
        reviewDepth: "quick",
        writingLevel: "standard",
        tone: "formal",
        status: "completed",
      })
      .returning();
    await ctx.db.insert(reviewRoundsTable).values([
      {
        generationId: generation.id,
        round: 0,
        rating: 6,
        inputTokens: 1,
        outputTokens: 1,
      },
      {
        generationId: generation.id,
        round: 1,
        rating: 9,
        inputTokens: 1,
        outputTokens: 1,
        kept: true,
      },
    ]);
    await ctx.db
      .insert(fitChecksTable)
      .values({ openingId: first.openingId, band: "high" });
    await ctx.tracker.updateDetails({
      userId: ctx.user.id,
      applicationId: first.applicationId,
      resumeVersionId: generated.id,
    });

    // Applies with a copy of the library resume, not rated, never checked.
    const second = await ctx.external();
    const secondApplication = await documents.findOrInsertApplication({
      profileId: ctx.profile.id,
      openingId: second.openingId,
    });
    const secondDocument = await documents.findOrInsertApplicationDocument({
      profileId: ctx.profile.id,
      applicationId: secondApplication.id,
      kind: "resume",
    });
    const copy = await documents.insertVersion({
      documentId: secondDocument.id,
      language: "en-US",
      libraryVersionId: libraryVersion.id,
    });
    await ctx.tracker.updateDetails({
      userId: ctx.user.id,
      applicationId: second.applicationId,
      resumeVersionId: copy.id,
    });

    const metrics = await ctx.tracker.metrics({
      userId: ctx.user.id,
      period: "all",
      now,
    });
    expect(metrics.byOrigin).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          origin: "generated",
          sent: 1,
        }),
        expect.objectContaining({
          origin: "library",
          libraryDocumentId: library.id,
          label: "Backend roles",
          sent: 1,
        }),
      ])
    );
    expect(metrics.byScore).toEqual(
      expect.arrayContaining([
        { band: "reached", sent: 1, responded: 0 },
        { band: "none", sent: 1, responded: 0 },
      ])
    );
    expect(metrics.byFit).toEqual(
      expect.arrayContaining([
        { band: "high", sent: 1, responded: 0 },
        { band: null, sent: 1, responded: 0 },
      ])
    );
  });

  it("encrypts the free text and picks the resume by hand only when none was recorded", async () => {
    const ctx = await setup();
    const { applicationId } = await ctx.external();
    const documents = new DocumentsRepository(ctx.db);
    const [library] = await ctx.db
      .insert(documentsTable)
      .values({ profileId: ctx.profile.id, kind: "resume" })
      .returning();
    const version = await documents.insertVersion({
      documentId: library.id,
      language: "pt-BR",
    });

    await ctx.tracker.updateDetails({
      userId: ctx.user.id,
      applicationId,
      source: "other",
      sourceDetail: "Meetup",
      resumeVersionId: version.id,
      nextStep: "HR call with Ana (ana@globex.com)",
      notes: "Ana's phone 555-0100",
      declineReason: "Onsite five days",
    });

    const [raw] = await ctx.db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.id, applicationId));
    for (const value of [
      raw.encryptedNextStep,
      raw.encryptedNotes,
      raw.encryptedDeclineReason,
      raw.encryptedSourceDetail,
    ]) {
      expect(value).toBeTruthy();
      expect(value).not.toMatch(/Ana|Meetup|Onsite/);
    }

    const detail = await ctx.tracker.get({
      userId: ctx.user.id,
      applicationId,
    });
    expect(detail).toMatchObject({
      source: "other",
      sourceDetail: "Meetup",
      nextStep: "HR call with Ana (ana@globex.com)",
      notes: "Ana's phone 555-0100",
      declineReason: "Onsite five days",
      resumeSent: { versionId: version.id, language: "pt-BR" },
      resumeSentAutomatically: false,
    });
    expect(
      (
        await ctx.tracker.metrics({
          userId: ctx.user.id,
          period: "all",
          now,
        })
      ).byOrigin[0]
    ).toMatchObject({ origin: "library", sent: 1 });

    // Null clears; an omitted field stays.
    await ctx.tracker.updateDetails({
      userId: ctx.user.id,
      applicationId,
      notes: null,
    });
    const cleared = await ctx.tracker.get({
      userId: ctx.user.id,
      applicationId,
    });
    expect(cleared.notes).toBeNull();
    expect(cleared.nextStep).not.toBeNull();

    // One still in preparation records its own: no hand-picking.
    await ctx.db
      .update(applicationsTable)
      .set({ status: "in_preparation" })
      .where(eq(applicationsTable.id, applicationId));
    await expect(
      ctx.tracker.updateDetails({
        userId: ctx.user.id,
        applicationId,
        resumeVersionId: version.id,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("shows the next step in the follow-up reminder", async () => {
    const ctx = await setup();
    const { applicationId } = await ctx.external(ago(12));
    await ctx.tracker.updateDetails({
      userId: ctx.user.id,
      applicationId,
      nextStep: "Email Ana on Friday",
    });
    expect(await ctx.tracker.reminders(ctx.user.id, now)).toEqual([
      expect.objectContaining({
        kind: "follow_up",
        text: "Email Ana on Friday",
      }),
    ]);
  });

  it("publishes a decline reason as a discard rule, that line only", async () => {
    const ctx = await setup();
    const { applicationId } = await ctx.external();
    const profiles = new ProfileService(ctx.db);
    const started = await profiles.getDraft({
      userId: ctx.user.id,
      language: "en-US",
      kind: "preferences",
    });
    await profiles.saveDraft({
      userId: ctx.user.id,
      markdown: started.markdown.replace(
        "## Excluded sectors",
        "## Excluded sectors\n\n- Tobacco"
      ),
      baseRevision: started.revision,
      kind: "preferences",
    });
    await expect(
      ctx.tracker.addDeclineReasonAsRule({
        userId: ctx.user.id,
        applicationId,
        language: "en-US",
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    await ctx.tracker.updateDetails({
      userId: ctx.user.id,
      applicationId,
      declineReason: "Onsite five days\na week",
    });
    await ctx.tracker.addDeclineReasonAsRule({
      userId: ctx.user.id,
      applicationId,
      language: "en-US",
    });
    // Twice adds it once.
    await ctx.tracker.addDeclineReasonAsRule({
      userId: ctx.user.id,
      applicationId,
      language: "en-US",
    });

    const draft = await profiles.getDraft({
      userId: ctx.user.id,
      language: "en-US",
      kind: "preferences",
    });
    expect(draft.markdown.match(/Onsite five days a week/g)).toHaveLength(1);
    expect(draft.markdown).toContain("- Tobacco");
    expect(draft.publishedVersion?.number).toBe(1);
    const published = await profiles.getVersion({
      userId: ctx.user.id,
      profileVersionId: draft.publishedVersion!.id,
      kind: "preferences",
    });
    expect(published.markdown).toContain("- Onsite five days a week");
    expect(published.markdown).not.toContain("Tobacco");
  });

  it("excludes the company of an application from the tracker", async () => {
    const ctx = await setup();
    const { applicationId } = await ctx.external();
    await expect(
      ctx.tracker.excludeCompany({
        userId: ctx.user.id,
        applicationId,
        date: "2026-11-17",
        language: "en-US",
      })
    ).resolves.toEqual({ company: "Globex" });
    const draft = await new ProfileService(ctx.db).getDraft({
      userId: ctx.user.id,
      language: "en-US",
      kind: "preferences",
    });
    expect(draft.markdown).toContain("- Globex (2026-11-17)");
    expect(draft.publishedVersion?.number).toBe(1);
  });

  it("refuses another user's application everywhere", async () => {
    const ctx = await setup();
    const { applicationId } = await ctx.external();
    const other = await createTestUser("grace@example.com");
    await new CareerRepository(ctx.db).insertProfileIfMissing({
      userId: other.id,
      interviewLanguage: "en-US",
    });
    const denied = { code: "NOT_FOUND" };
    await expect(
      ctx.tracker.updateDetails({
        userId: other.id,
        applicationId,
        notes: "x",
      })
    ).rejects.toMatchObject(denied);
    await expect(
      ctx.tracker.addDeclineReasonAsRule({
        userId: other.id,
        applicationId,
        language: "en-US",
      })
    ).rejects.toMatchObject(denied);
    await expect(
      ctx.tracker.excludeCompany({
        userId: other.id,
        applicationId,
        date: "2026-11-17",
        language: "en-US",
      })
    ).rejects.toMatchObject(denied);
    // Nor does the other user's metrics count it.
    expect(
      (await ctx.tracker.metrics({ userId: other.id, period: "all", now })).sent
    ).toBe(0);
  });
});
