import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { evidenceTable } from "@repo/api/domains/evidence/db/evidence-tables";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { CareerService } from "./career-service";
import { positionsTable } from "./db/career-tables";

vi.mock("@repo/common/env/web.env", () => ({
  env: { ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}` },
}));

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const career = new CareerService(db);
  const profile = await career.getOrCreateProfile({
    userId: user.id,
    defaultLanguage: "en-US",
  });
  const timeline = () =>
    career.getTimeline({ userId: user.id, defaultLanguage: "en-US" });
  return { db, user, career, profile, timeline };
}

async function importPositions(
  ctx: Awaited<ReturnType<typeof setup>>,
  imported: Parameters<CareerService["applyImportedPositions"]>[0]["imported"]
) {
  await ctx.db.transaction(async (tx) => {
    const cipher = await getUserCipher(tx, ctx.user.id);
    await ctx.career.applyImportedPositions({
      tx,
      cipher,
      profileId: ctx.profile.id,
      sourceDocumentId: crypto.randomUUID(),
      origin: "imported",
      imported,
    });
  });
}

describe("career timeline", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("turns the same position from two resumes into one entry with its date conflict", async () => {
    const ctx = await setup();
    const acme = {
      employer: "Acme Corp",
      title: "Senior Engineer",
      startDate: "2020-01",
      endDate: "2023-06",
    };

    await importPositions(ctx, [acme]);
    await importPositions(ctx, [
      { ...acme, employer: "ACME", startDate: "2019-11" },
    ]);

    const { positions } = await ctx.timeline();
    expect(positions).toHaveLength(1);
    expect(positions[0].conflicts).toEqual([
      expect.objectContaining({
        field: "startDate",
        options: ["2020-01", "2019-11"],
      }),
    ]);

    await ctx.career.resolveConflict({
      userId: ctx.user.id,
      positionConflictId: positions[0].conflicts[0].id,
      value: "2019-11",
    });
    const [resolved] = (await ctx.timeline()).positions;
    expect(resolved.startDate).toBe("2019-11");
    expect(resolved.conflicts).toEqual([]);
  });

  it("stores employers and titles encrypted", async () => {
    const ctx = await setup();
    await ctx.career.addPosition({
      userId: ctx.user.id,
      position: {
        employer: "Banco X",
        title: "Data Lead",
        startDate: "2021-02",
      },
    });

    const [row] = await ctx.db.select().from(positionsTable);
    expect(row.encryptedEmployer).not.toContain("Banco");
    expect((await ctx.timeline()).positions[0]).toMatchObject({
      employer: "Banco X",
      title: "Data Lead",
      origin: "manual",
      depth: { level: "confirmed" },
    });
  });

  it("adds, edits and merges positions without any file", async () => {
    const ctx = await setup();
    const { positionId: first } = await ctx.career.addPosition({
      userId: ctx.user.id,
      position: { employer: "Acme", title: "Engineer", startDate: "2020-01" },
    });
    const { positionId: duplicate } = await ctx.career.addPosition({
      userId: ctx.user.id,
      position: {
        employer: "Acme Inc",
        title: "Engineer",
        startDate: "2020-01",
      },
    });

    await ctx.career.updatePosition({
      userId: ctx.user.id,
      positionId: first,
      position: {
        employer: "Acme",
        title: "Staff Engineer",
        startDate: "2020-01",
      },
    });
    await ctx.career.mergePositions({
      userId: ctx.user.id,
      positionId: duplicate,
      intoPositionId: first,
    });

    const { positions } = await ctx.timeline();
    expect(positions.map((p) => [p.id, p.title])).toEqual([
      [first, "Staff Engineer"],
    ]);
  });

  it("restores a removed position with its evidence", async () => {
    const ctx = await setup();
    const { positionId } = await ctx.career.addPosition({
      userId: ctx.user.id,
      position: { employer: "Acme", title: "Engineer", startDate: "2020-01" },
    });
    const cipher = await getUserCipher(ctx.db, ctx.user.id);
    await ctx.db.insert(evidenceTable).values({
      profileId: ctx.profile.id,
      positionId,
      kind: "achievement",
      encryptedText: cipher.encrypt("Cut deploys from 2h to 15min"),
      encryptedSourceQuote: cipher.encrypt("from 2 hours to 15 minutes"),
      language: "en-US",
      approvedAt: new Date(),
    });

    await ctx.career.removePosition({ userId: ctx.user.id, positionId });
    let timeline = await ctx.timeline();
    expect(timeline.positions).toEqual([]);
    expect(timeline.removedPositions.map((p) => p.id)).toEqual([positionId]);

    await ctx.career.restorePosition({ userId: ctx.user.id, positionId });
    timeline = await ctx.timeline();
    expect(timeline.positions[0]).toMatchObject({
      id: positionId,
      status: "pending",
      depth: { counts: { evidence: 1 } },
    });
  });

  it("refuses to touch another user's position", async () => {
    const ctx = await setup();
    const { positionId } = await ctx.career.addPosition({
      userId: ctx.user.id,
      position: { employer: "Acme", title: "Engineer" },
    });
    const grace = await createTestUser("grace@example.com");
    await ctx.career.getOrCreateProfile({
      userId: grace.id,
      defaultLanguage: "en-US",
    });

    await expect(
      ctx.career.removePosition({ userId: grace.id, positionId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("merges a credential imported twice into the one kept", async () => {
    const ctx = await setup();
    const { credentialId: kept } = await ctx.career.addCredential({
      userId: ctx.user.id,
      credential: {
        kind: "education",
        title: "Bacharelado em Sistemas de Informação",
        institution: "UFS",
        status: "completed",
      },
    });
    const { credentialId: duplicate } = await ctx.career.addCredential({
      userId: ctx.user.id,
      credential: {
        kind: "education",
        title: "Information Systems · Bachelor",
        institution: "UFS",
        status: "completed",
      },
    });
    const cipher = await getUserCipher(ctx.db, ctx.user.id);
    await ctx.db.insert(evidenceTable).values({
      profileId: ctx.profile.id,
      credentialId: duplicate,
      kind: "achievement",
      encryptedText: cipher.encrypt("Graduated with honors"),
      encryptedSourceQuote: cipher.encrypt("with honors"),
      language: "en-US",
      approvedAt: new Date(),
    });

    await expect(
      ctx.career.mergeCredentials({
        userId: ctx.user.id,
        credentialId: kept,
        intoCredentialId: kept,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const stranger = await createTestUser("eve@example.com");
    await expect(
      ctx.career.mergeCredentials({
        userId: stranger.id,
        credentialId: duplicate,
        intoCredentialId: kept,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await ctx.career.mergeCredentials({
      userId: ctx.user.id,
      credentialId: duplicate,
      intoCredentialId: kept,
    });

    const { credentials } = await ctx.timeline();
    expect(credentials.map((c) => [c.id, c.title])).toEqual([
      [kept, "Bacharelado em Sistemas de Informação"],
    ]);
    // Its evidence came along.
    const rows = await ctx.db.select().from(evidenceTable);
    expect(rows.map((row) => row.credentialId)).toEqual([kept]);
  });
});
