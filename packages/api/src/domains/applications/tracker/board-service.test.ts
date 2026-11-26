import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { fitChecksTable } from "@repo/api/domains/openings/db/openings-tables";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { OpeningStatus } from "@repo/api/domains/openings/schemas/opening";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import type { BoardFilter, BoardSort } from "../schemas/tracker";
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
  const cipher = await getUserCipher(db, user.id);
  const opening = async (
    company: string,
    over: { status?: OpeningStatus; createdAt?: Date } = {}
  ) => {
    const row = await new OpeningsRepository(db).insertOpening({
      profileId: profile.id,
      kind: "posted",
      status: over.status ?? "analyzed",
      encryptedCompany: cipher.encrypt(company),
      encryptedTitle: cipher.encrypt("Engineer"),
      createdAt: over.createdAt ?? now,
    });
    return row.id;
  };
  const board = (
    filter: BoardFilter = {},
    over: { sort?: BoardSort; limit?: number; cursor?: string | null } = {}
  ) =>
    tracker.board({
      userId: user.id,
      filter,
      sort: over.sort ?? "activity",
      cursor: over.cursor,
      limit: over.limit ?? 25,
      now,
    });
  const external = (company: string, appliedAt: Date) =>
    tracker.createExternal({
      userId: user.id,
      company,
      title: "Engineer",
      link: "https://example.com/jobs/1",
      status: "applied",
      appliedAt,
      now: appliedAt,
    });
  return { db, user, profile, tracker, opening, board, external };
}

/** Every page of a request, following the cursor. */
async function allPages(
  load: (cursor: string | null) => ReturnType<TrackerService["board"]>
) {
  const rows = [];
  let cursor: string | null = null;
  do {
    const page = await load(cursor);
    rows.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);
  return rows;
}

describe("the Openings board", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("lists analyzed and closed openings with their board status", async () => {
    const ctx = await setup();
    await ctx.opening("Acme", { createdAt: ago(1) });
    await ctx.opening("Initech", { status: "closed", createdAt: ago(2) });
    await ctx.opening("Processing", { status: "processing" });
    await ctx.opening("Failed", { status: "failed" });
    await ctx.external("Globex", ago(3));

    const all = await ctx.board();
    expect(all.total).toBe(3);
    expect(all.data.map((row) => [row.company, row.status, row.state])).toEqual(
      [
        ["Acme", "analyzed", "open"],
        ["Initech", "closed", "closed"],
        ["Globex", "applied", "open"],
      ]
    );
    expect(all.data[0]).toMatchObject({
      applicationId: null,
      resumeOrigin: null,
    });
    expect(all.data[2]).toMatchObject({ resumeOrigin: "not_recorded" });

    const open = await ctx.board({ state: ["open"] });
    expect(open.data.map((row) => row.company)).toEqual(["Acme", "Globex"]);
    const applied = await ctx.tracker.board({
      userId: ctx.user.id,
      filter: {},
      sort: "activity",
      column: "applied",
      limit: 10,
    });
    expect(applied.data.map((row) => row.company)).toEqual(["Globex"]);
  });

  it("pages by keyset without repeating or skipping", async () => {
    const ctx = await setup();
    for (let index = 0; index < 5; index++) {
      await ctx.opening(`Company ${index}`, { createdAt: ago(index) });
    }
    const first = await ctx.board({}, { limit: 2 });
    expect(first.total).toBe(5);
    expect(first.data).toHaveLength(2);
    const rows = await allPages((cursor) =>
      ctx.board({}, { limit: 2, cursor })
    );
    expect(rows.map((row) => row.company)).toEqual([
      "Company 0",
      "Company 1",
      "Company 2",
      "Company 3",
      "Company 4",
    ]);
  });

  it("pages by sent date and by status, ties broken by activity", async () => {
    const ctx = await setup();
    await ctx.opening("Analyzed", { createdAt: ago(1) });
    await ctx.external("Old", ago(9));
    await ctx.external("New", ago(2));
    await ctx.opening("Closed", { status: "closed", createdAt: ago(5) });

    const bySent = await allPages((cursor) =>
      ctx.board({}, { sort: "sent", limit: 1, cursor })
    );
    expect(bySent.map((row) => row.company)).toEqual([
      "New",
      "Old",
      "Analyzed",
      "Closed",
    ]);
    const byStatus = await allPages((cursor) =>
      ctx.board({}, { sort: "status", limit: 1, cursor })
    );
    expect(byStatus.map((row) => row.company)).toEqual([
      "Analyzed",
      "New",
      "Old",
      "Closed",
    ]);
  });

  it("filters by company part and free text in memory, still in pages", async () => {
    const ctx = await setup();
    await ctx.opening("Acme Labs", { createdAt: ago(1) });
    await ctx.opening("Globex", { createdAt: ago(2) });
    await ctx.opening("ACME Corp", { createdAt: ago(3) });

    const first = await ctx.board({ company: ["acme"] }, { limit: 1 });
    expect(first.total).toBe(2);
    const rows = await allPages((cursor) =>
      ctx.board({ company: ["acme"] }, { limit: 1, cursor })
    );
    expect(rows.map((row) => row.company)).toEqual(["Acme Labs", "ACME Corp"]);

    const byCompany = await ctx.board({}, { sort: "company" });
    expect(byCompany.data.map((row) => row.company)).toEqual([
      "ACME Corp",
      "Acme Labs",
      "Globex",
    ]);
    expect((await ctx.board({ q: "glob" })).total).toBe(1);
  });

  it("filters by fit, source and sent, a missing value never matching", async () => {
    const ctx = await setup();
    const checked = await ctx.opening("Checked", { createdAt: ago(1) });
    await ctx.db
      .insert(fitChecksTable)
      .values({ openingId: checked, band: "high" });
    await ctx.opening("Unchecked", { createdAt: ago(2) });
    const { applicationId } = await ctx.external("Sent", ago(3));
    await ctx.tracker.updateDetails({
      userId: ctx.user.id,
      applicationId,
      source: "linkedin",
    });

    const names = async (filter: BoardFilter) =>
      (await ctx.board(filter)).data.map((row) => row.company);
    expect(await names({ fit: ["high"] })).toEqual(["Checked"]);
    expect(await names({ fit: ["not_checked"] })).toEqual([
      "Unchecked",
      "Sent",
    ]);
    expect(await names({ source: ["linkedin"] })).toEqual(["Sent"]);
    expect(await names({ sourceNot: ["linkedin"] })).toEqual([
      "Checked",
      "Unchecked",
    ]);
    expect(await names({ sent: ["sent"] })).toEqual(["Sent"]);
    expect(await names({ sentNot: ["sent"], fitNot: ["high"] })).toEqual([
      "Unchecked",
    ]);
    expect(await names({ resume: ["not_recorded"] })).toEqual(["Sent"]);
  });

  it("shows only the user's own openings", async () => {
    const ctx = await setup();
    await ctx.opening("Acme");
    const other = await createTestUser("bob@example.com");
    expect(
      (
        await ctx.tracker.board({
          userId: other.id,
          filter: {},
          sort: "activity",
          limit: 10,
        })
      ).total
    ).toBe(0);
  });
});
