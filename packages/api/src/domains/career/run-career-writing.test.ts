import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAiClient } from "@repo/api/domains/ai/ai-client";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import {
  evidenceTable,
  sensitiveItemsTable,
} from "@repo/api/domains/evidence/db/evidence-tables";
import { loadSensitiveFilter } from "@repo/api/domains/evidence/sensitive/load-sensitive-filter";
import { ForbiddenTermError } from "@repo/api/domains/evidence/sensitive/sensitive-filter";
import {
  interviewSessionsTable,
  interviewTurnsTable,
} from "@repo/api/domains/interview/db/interview-tables";
import { InterviewRepository } from "@repo/api/domains/interview/interview-repository";
import { createTestUser } from "@repo/api/test/create-test-user";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { CareerRepository } from "./career-repository";
import { CareerService } from "./career-service";
import { runDraftNarrative, runSummarizePosition } from "./run-career-writing";

vi.mock("@repo/common/env/web.env", () => ({
  env: { ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}` },
}));

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const career = new CareerService(db, { start: vi.fn() } as never);
  const profile = await career.getOrCreateProfile({
    userId: user.id,
    defaultLanguage: "en-US",
  });
  const { positionId } = await career.addPosition({
    userId: user.id,
    position: {
      employer: "Acme",
      title: "Staff Engineer",
      startDate: "2021-01",
    },
  });
  const cipher = await getUserCipher(db, user.id);
  await db.insert(evidenceTable).values(
    ["Led Project Phoenix for Banco X", "Mentored 4 engineers"].map((text) => ({
      profileId: profile.id,
      positionId,
      kind: "achievement" as const,
      encryptedText: cipher.encrypt(text),
      encryptedSourceQuote: cipher.encrypt(text),
      language: "en-US" as const,
      approvedAt: new Date(),
    }))
  );
  await db.insert(sensitiveItemsTable).values([
    {
      profileId: profile.id,
      kind: "codename",
      encryptedOriginal: cipher.encrypt("Project Phoenix"),
      choice: "exclude",
      reviewedAt: new Date(),
    },
    {
      profileId: profile.id,
      kind: "client",
      encryptedOriginal: cipher.encrypt("Banco X"),
      choice: "generalize",
      encryptedGeneralized: cipher.encrypt("a large bank"),
      reviewedAt: new Date(),
    },
  ]);

  const aiFor = async (script: Parameters<typeof fakeProviderPackage>[0]) => {
    const fake = fakeProviderPackage(script);
    const ai = createAiClient({
      db,
      userId: user.id,
      funding: "credits",
      providerPackage: fake.providerPackage,
      sensitiveFilter: await loadSensitiveFilter({
        db,
        cipher,
        profileId: profile.id,
      }),
    });
    return { ...fake, ai };
  };
  return { db, user, profile, positionId, cipher, aiFor };
}

describe("career writing", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("summarizes from approved facts with sensitive items applied", async () => {
    const ctx = await setup();
    const { ai, generateText } = await ctx.aiFor({
      text: () => "A staff engineer who mentored four engineers.",
    });

    await runSummarizePosition({ ...ctx, ai, profileId: ctx.profile.id });

    const { system } = generateText.mock.calls[0][0];
    // The fact resting on the excluded codename is left out entirely.
    expect(system).not.toMatch(/phoenix|banco x/i);
    expect(system).toContain("Mentored 4 engineers");
    const [summary] = await new CareerRepository(ctx.db).latestSummaries([
      ctx.positionId,
    ]);
    expect(ctx.cipher.decrypt(summary.encryptedSummary)).toContain("mentored");
  });

  it("rejects an output carrying a forbidden term, after one regeneration", async () => {
    const ctx = await setup();
    const { ai, generateText } = await ctx.aiFor({
      text: () => "Led the Phoenix migration at Banco X.",
    });

    await expect(
      runSummarizePosition({ ...ctx, ai, profileId: ctx.profile.id })
    ).rejects.toBeInstanceOf(ForbiddenTermError);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(
      await new CareerRepository(ctx.db).latestSummaries([ctx.positionId])
    ).toEqual([]);
  });

  it("drafts the narrative from approved summaries only", async () => {
    const ctx = await setup();
    const career = new CareerRepository(ctx.db);
    await career.updatePosition(ctx.positionId, {
      status: "approved",
      approvedAt: new Date(),
    });
    await career.insertSummary({
      positionId: ctx.positionId,
      encryptedSummary: ctx.cipher.encrypt("Built the platform team."),
      version: 1,
    });
    const { ai, generateObject } = await ctx.aiFor({
      object: () => ({
        text: "From engineer to platform lead.",
        themes: ["Platform"],
      }),
    });

    await runDraftNarrative({ ...ctx, ai, profileId: ctx.profile.id });

    expect(generateObject.mock.calls[0][0].system).toContain(
      "Built the platform team."
    );
    const narrative = await career.latestNarrative(ctx.profile.id);
    expect(ctx.cipher.decrypt(narrative.encryptedText)).toBe(
      "From engineer to platform lead."
    );
  });

  it("deletes transcripts 7 days after their extraction is approved", async () => {
    const ctx = await setup();
    const day = 24 * 3600 * 1000;
    const sessions = await ctx.db
      .insert(interviewSessionsTable)
      .values([
        {
          profileId: ctx.profile.id,
          positionId: ctx.positionId,
          status: "closed",
          extractionApprovedAt: new Date(Date.now() - 8 * day),
        },
        {
          profileId: ctx.profile.id,
          positionId: ctx.positionId,
          status: "closed",
          extractionApprovedAt: new Date(Date.now() - 2 * day),
        },
        {
          profileId: ctx.profile.id,
          positionId: ctx.positionId,
          status: "open",
        },
      ])
      .returning();
    await ctx.db.insert(interviewTurnsTable).values(
      sessions.map((session) => ({
        sessionId: session.id,
        role: "user" as const,
        encryptedContent: ctx.cipher.encrypt("words"),
        language: "en-US" as const,
      }))
    );

    const deleted = await new InterviewRepository(
      ctx.db
    ).deleteTurnsApprovedBefore(new Date(Date.now() - 7 * day));

    expect(deleted).toBe(1);
    const remaining = await ctx.db.select().from(interviewTurnsTable);
    expect(remaining.map((turn) => turn.sessionId).sort()).toEqual(
      [sessions[1].id, sessions[2].id].sort()
    );
  });
});
