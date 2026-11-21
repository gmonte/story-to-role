import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AiFunding } from "@repo/api/domains/ai/ai-funding";
import { AiUsageRepository } from "@repo/api/domains/ai/ai-usage-repository";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import {
  documentsTable,
  generationsTable,
} from "@repo/api/domains/documents/db/documents-tables";
import { DocumentsRepository } from "@repo/api/domains/documents/documents-repository";
import type {
  DocumentKind,
  GenerationKind,
} from "@repo/api/domains/documents/schemas/document";
import type { TaskType } from "@repo/api/domains/tasks/schemas/task";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import { createTestUser } from "@repo/api/test/create-test-user";
import type { DbClient } from "@repo/api/tools/db-client";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { reserveCredits, settleCredits } from "./credit-ledger";
import { CreditsService } from "./credits-service";

vi.mock("@repo/api/tools/trigger/trigger-client", () => ({
  triggerClient: { trigger: vi.fn() },
}));

const now = new Date("2026-11-20T12:00:00Z");
const at = (iso: string) => new Date(iso);
const window = {
  from: at("2026-11-01T00:00:00Z"),
  to: at("2026-12-01T00:00:00Z"),
};

// Sonnet, 100k in and 10k out: US$0.30, 45 credits as an equivalent.
const sonnetCall = {
  model: "claude-sonnet-5-5",
  inputTokens: 100_000,
  outputTokens: 10_000,
};
// Haiku, 100k in and 20k out: US$0.02.
const haikuCall = {
  model: "claude-haiku-5-5",
  inputTokens: 100_000,
  outputTokens: 20_000,
};

type UsageInput = Parameters<CreditsService["usageStatement"]>[1];

/** The statement with every operation of its window on one page. */
async function usage(db: DbClient, userId: string, input: UsageInput) {
  const credits = new CreditsService(db);
  const statement = await credits.usageStatement(userId, input);
  const page = await credits.usageOperations(userId, { ...input, limit: 100 });
  return { ...statement, operations: page.data };
}

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const usage = new AiUsageRepository(db);
  const tasks = new TasksRepository(db);

  const call = (input: {
    taskId?: string;
    funding: AiFunding;
    purpose: string;
    createdAt: Date;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }) =>
    usage.record({
      userId: user.id,
      provider: "anthropic",
      role: "writing",
      ...input,
    });

  /** A finished task with its calls; credit-funded ones debit `debited`. */
  async function task(input: {
    type: TaskType;
    funding: AiFunding;
    calls: Array<{ model: string; inputTokens: number; outputTokens: number }>;
    debited?: number;
    subjectId?: string;
    documentKind?: DocumentKind;
    generationKind?: GenerationKind;
    failed?: boolean;
    createdAt?: Date;
  }) {
    const created = await tasks.create({
      userId: user.id,
      type: input.type,
      funding: input.funding,
      subjectId: input.subjectId,
      documentKind: input.documentKind,
      generationKind: input.generationKind,
    });
    if (input.funding === "credits") {
      await reserveCredits(db, {
        userId: user.id,
        taskId: created.id,
        cap: 200,
        scope: "any",
        now,
      });
    }
    for (const usageCall of input.calls) {
      await call({
        ...usageCall,
        taskId: created.id,
        funding: input.funding,
        purpose: input.type,
        createdAt: input.createdAt ?? at("2026-11-10T10:00:00Z"),
      });
    }
    if (input.funding === "credits") {
      await settleCredits(db, {
        userId: user.id,
        taskId: created.id,
        actual: input.failed ? 0 : (input.debited ?? 0),
      });
    }
    if (input.failed) {
      await tasks.markFailed({ taskId: created.id, errorMessage: "boom" });
    } else {
      await tasks.markCompleted(created.id);
    }
    return created;
  }

  /** A resume generation, for the operation's name. */
  async function resumeGeneration() {
    const career = new CareerRepository(db);
    await career.insertProfileIfMissing({
      userId: user.id,
      interviewLanguage: "en-US",
    });
    const profile = await career.findProfileByUserId(user.id);
    const [document] = await db
      .insert(documentsTable)
      .values({ profileId: profile.id, kind: "resume" })
      .returning();
    const version = await new DocumentsRepository(db).insertVersion({
      documentId: document.id,
      language: "en-US",
    });
    const [generation] = await db
      .insert(generationsTable)
      .values({
        profileId: profile.id,
        documentId: document.id,
        versionId: version.id,
        language: "en-US",
        reviewDepth: "quick",
        writingLevel: "standard",
        tone: "formal",
        status: "completed",
      })
      .returning();
    return generation.id;
  }

  return { db, user, call, task, resumeGeneration };
}

describe("usage statement", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("lists a resume paid with credits by what it debited, split by model", async () => {
    const ctx = await setup();
    const generationId = await ctx.resumeGeneration();
    await ctx.task({
      type: "generate_document",
      funding: "credits",
      subjectId: generationId,
      calls: [sonnetCall, haikuCall],
      debited: 48,
    });

    const statement = await usage(ctx.db, ctx.user.id, {
      ...window,
      showsPlatformCost: false,
      now,
    });

    expect(statement.operations).toHaveLength(1);
    expect(statement.operations[0]).toMatchObject({
      operation: {
        taskType: "generate_document",
        documentKind: "resume",
        generationKind: "generate",
        purpose: null,
      },
      status: "completed",
      payer: "credits",
      credits: 48,
      inputTokens: 200_000,
      outputTokens: 30_000,
      // US$ reveals the margin: shown only for the user's own key.
      usd: null,
    });
    expect(statement.operations[0].models).toEqual([
      {
        model: "claude-sonnet-5-5",
        inputTokens: 100_000,
        outputTokens: 10_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        credits: 45,
        usd: null,
      },
      {
        model: "claude-haiku-5-5",
        inputTokens: 100_000,
        outputTokens: 20_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        credits: 3,
        usd: null,
      },
    ]);
  });

  it("keeps a document operation's kind after its document is deleted", async () => {
    const ctx = await setup();
    const generationId = await ctx.resumeGeneration();
    await ctx.task({
      type: "generate_document",
      funding: "credits",
      subjectId: generationId,
      documentKind: "resume",
      generationKind: "generate",
      calls: [sonnetCall],
      debited: 45,
    });
    // Deleting the document deletes its generations; the task survives.
    await ctx.db.delete(documentsTable);

    const statement = await usage(ctx.db, ctx.user.id, {
      ...window,
      showsPlatformCost: false,
      now,
    });

    expect(statement.operations).toHaveLength(1);
    expect(statement.operations[0].operation).toMatchObject({
      taskType: "generate_document",
      documentKind: "resume",
      generationKind: "generate",
    });
  });

  it("shows what the user's key paid with US$ and its credit equivalent", async () => {
    const ctx = await setup();
    await ctx.task({
      type: "profile_agent_turn",
      funding: "key",
      calls: [sonnetCall],
    });

    const statement = await usage(ctx.db, ctx.user.id, {
      ...window,
      showsPlatformCost: false,
      now,
    });

    expect(statement.operations[0]).toMatchObject({
      operation: { taskType: "profile_agent_turn", documentKind: null },
      payer: "key",
      credits: 45,
      usd: 0.3,
    });
    expect(statement.totals).toEqual([
      {
        payer: "key",
        operations: 1,
        inputTokens: 100_000,
        outputTokens: 10_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        credits: 45,
        usd: 0.3,
      },
    ]);
  });

  it("shows what StoryToRole paid only when the deployment shows the platform's cost", async () => {
    const ctx = await setup();
    // A call outside any task, and a task that failed: nothing charged.
    await ctx.call({
      funding: "credits",
      purpose: "gap_answer_sentence",
      createdAt: at("2026-11-12T09:00:00Z"),
      ...haikuCall,
    });
    await ctx.task({
      type: "analyze_opening",
      funding: "credits",
      calls: [sonnetCall],
      failed: true,
      createdAt: at("2026-11-09T10:00:00Z"),
    });
    await ctx.task({
      type: "analyze_opening",
      funding: "credits",
      calls: [haikuCall],
      debited: 3,
    });

    const hidden = await usage(ctx.db, ctx.user.id, {
      ...window,
      showsPlatformCost: false,
      now,
    });
    expect(hidden.operations.map((row) => row.payer)).toEqual(["credits"]);
    expect(hidden.totals.map((row) => row.payer)).toEqual(["credits"]);

    const shown = await usage(ctx.db, ctx.user.id, {
      ...window,
      showsPlatformCost: true,
      now,
    });
    expect(
      shown.operations.map((row) => [
        row.operation.taskType ?? row.operation.purpose,
        row.payer,
        row.status,
        row.credits,
        row.usd,
      ])
    ).toEqual([
      ["gap_answer_sentence", "storytorole", "completed", 3, 0.02],
      ["analyze_opening", "credits", "completed", 3, 0.02],
      ["analyze_opening", "storytorole", "failed", 45, 0.3],
    ]);
  });

  it("leaves out another user's calls, inside a task or not", async () => {
    const ctx = await setup();
    await ctx.call({
      funding: "credits",
      purpose: "gap_answer_sentence",
      createdAt: at("2026-11-12T09:00:00Z"),
      ...haikuCall,
    });
    const other = await createTestUser("grace@example.com");
    const otherUsage = new AiUsageRepository(ctx.db);
    await otherUsage.record({
      userId: other.id,
      provider: "anthropic",
      role: "writing",
      funding: "credits",
      purpose: "gap_answer_sentence",
      createdAt: at("2026-11-13T09:00:00Z"),
      ...sonnetCall,
    });
    const otherTask = await new TasksRepository(ctx.db).create({
      userId: other.id,
      type: "analyze_opening",
      funding: "key",
    });
    await otherUsage.record({
      userId: other.id,
      provider: "anthropic",
      role: "writing",
      taskId: otherTask.id,
      funding: "key",
      purpose: "analyze_opening",
      createdAt: at("2026-11-14T09:00:00Z"),
      ...sonnetCall,
    });
    await new TasksRepository(ctx.db).markCompleted(otherTask.id);

    const statement = await usage(ctx.db, ctx.user.id, {
      ...window,
      showsPlatformCost: true,
      now,
    });
    expect(statement.operations).toHaveLength(1);
    expect(
      statement.totals.map((row) => [
        row.payer,
        row.operations,
        row.inputTokens,
      ])
    ).toEqual([["storytorole", 1, 100_000]]);
    expect(statement.summary.map((row) => row.count)).toEqual([1]);
  });

  it("averages each kind of completed operation, leaving out failed and running ones", async () => {
    const ctx = await setup();
    await ctx.task({
      type: "analyze_opening",
      funding: "key",
      calls: [sonnetCall],
    });
    await ctx.task({
      type: "analyze_opening",
      funding: "key",
      calls: [haikuCall],
    });
    await ctx.task({
      type: "analyze_opening",
      funding: "key",
      calls: [sonnetCall],
      failed: true,
    });
    const running = await new TasksRepository(ctx.db).create({
      userId: ctx.user.id,
      type: "analyze_opening",
      funding: "key",
    });
    await ctx.call({
      taskId: running.id,
      funding: "key",
      purpose: "fit_check_judgment",
      createdAt: at("2026-11-10T11:00:00Z"),
      ...sonnetCall,
    });

    const statement = await usage(ctx.db, ctx.user.id, {
      ...window,
      showsPlatformCost: false,
      now,
    });

    expect(statement.operations).toHaveLength(3);
    // 45 and 3 credits; 110k and 120k tokens; US$0.30 and US$0.02.
    expect(statement.summary).toEqual([
      {
        operation: {
          taskType: "analyze_opening",
          documentKind: null,
          generationKind: null,
          purpose: null,
        },
        count: 2,
        averageCredits: 24,
        averageTokens: 115_000,
        averageUsd: 0.16,
        totalCredits: 48,
      },
    ]);
  });

  it("covers the plan's credit month by default, or the last 30 days on Free", async () => {
    const ctx = await setup();
    await ctx.call({
      funding: "key",
      purpose: "gap_answer_sentence",
      createdAt: at("2026-10-25T09:00:00Z"),
      ...haikuCall,
    });
    const credits = new CreditsService(ctx.db);

    const free = await usage(ctx.db, ctx.user.id, {
      showsPlatformCost: false,
      now,
    });
    expect(free.window).toEqual({ from: at("2026-10-21T12:00:00Z"), to: now });
    expect(free.operations).toHaveLength(1);

    await credits.grantCourtesy({
      adminUserId: ctx.user.id,
      email: ctx.user.email,
      monthlyCredits: 0,
      endsAt: null,
      now,
    });
    const courtesy = await usage(ctx.db, ctx.user.id, {
      showsPlatformCost: false,
      now,
    });
    expect(courtesy.window).toEqual(window);
    expect(courtesy.operations).toHaveLength(0);
  });

  it("keeps an operation whole in the window of its last call", async () => {
    const ctx = await setup();
    const task = await ctx.task({
      type: "analyze_opening",
      funding: "credits",
      calls: [sonnetCall],
      debited: 50,
      createdAt: at("2026-10-31T23:59:00Z"),
    });
    await ctx.call({
      taskId: task.id,
      funding: "credits",
      purpose: "fit_check_judgment",
      createdAt: at("2026-11-01T00:01:00Z"),
      ...haikuCall,
    });

    const november = await usage(ctx.db, ctx.user.id, {
      ...window,
      showsPlatformCost: false,
      now,
    });
    expect(november.operations).toHaveLength(1);
    expect(november.operations[0]).toMatchObject({
      credits: 50,
      inputTokens: 200_000,
    });

    const october = await usage(ctx.db, ctx.user.id, {
      from: at("2026-10-01T00:00:00Z"),
      to: window.from,
      showsPlatformCost: false,
      now,
    });
    expect(october.operations).toHaveLength(0);
  });

  it("shares an operation's credits among models adding up to its total", async () => {
    const ctx = await setup();
    // Three models costing US$0.20 each.
    await ctx.task({
      type: "review_document",
      funding: "credits",
      calls: [
        { model: "claude-sonnet-5-5", inputTokens: 100_000, outputTokens: 0 },
        { model: "claude-opus-5-5", inputTokens: 50_000, outputTokens: 0 },
        { model: "claude-haiku-5-5", inputTokens: 2_000_000, outputTokens: 0 },
      ],
      debited: 10,
    });

    const statement = await usage(ctx.db, ctx.user.id, {
      ...window,
      showsPlatformCost: false,
      now,
    });

    expect(statement.operations[0].models.map((row) => row.credits)).toEqual([
      3.4, 3.3, 3.3,
    ]);
  });

  it("pages operations newest first, with a cursor and the total", async () => {
    const ctx = await setup();
    for (const day of ["05", "06", "07"]) {
      await ctx.call({
        funding: "key",
        purpose: "gap_answer_sentence",
        createdAt: at(`2026-11-${day}T09:00:00Z`),
        ...haikuCall,
      });
    }
    const credits = new CreditsService(ctx.db);
    const input = { ...window, showsPlatformCost: false, now, limit: 2 };

    const first = await credits.usageOperations(ctx.user.id, input);
    expect(first.total).toBe(3);
    expect(first.data.map((row) => row.at)).toEqual([
      at("2026-11-07T09:00:00Z"),
      at("2026-11-06T09:00:00Z"),
    ]);
    expect(first.nextCursor).not.toBeNull();

    const second = await credits.usageOperations(ctx.user.id, {
      ...input,
      cursor: first.nextCursor,
    });
    expect(second.data.map((row) => row.at)).toEqual([
      at("2026-11-05T09:00:00Z"),
    ]);
    expect(second.nextCursor).toBeNull();
  });

  it("sums every user's operations for the admin, with an average per model", async () => {
    const ctx = await setup();
    await ctx.task({
      type: "analyze_opening",
      funding: "credits",
      calls: [sonnetCall, haikuCall],
      debited: 50,
    });
    const other = await createTestUser("grace@example.com");
    const otherTask = await new TasksRepository(ctx.db).create({
      userId: other.id,
      type: "analyze_opening",
      funding: "key",
    });
    await new AiUsageRepository(ctx.db).record({
      userId: other.id,
      provider: "anthropic",
      role: "writing",
      taskId: otherTask.id,
      funding: "key",
      purpose: "analyze_opening",
      createdAt: at("2026-11-14T09:00:00Z"),
      ...sonnetCall,
    });
    await new TasksRepository(ctx.db).markCompleted(otherTask.id);

    const usage = await new CreditsService(ctx.db).platformUsage({
      ...window,
      now,
    });
    expect(usage.showsPlatformCost).toBe(true);
    expect(
      usage.totals.map((row) => [row.payer, row.operations, row.credits])
    ).toEqual([
      ["credits", 1, 50],
      ["key", 1, 45],
    ]);
    expect(usage.summary.map((row) => [row.count, row.averageCredits])).toEqual(
      [[2, 47.5]]
    );
    // Sonnet ran in both operations, Haiku in one: averages per operation.
    expect(
      usage.models.map((row) => [
        row.model,
        row.operations,
        row.averageInputTokens,
        row.averageOutputTokens,
      ])
    ).toEqual([
      ["claude-sonnet-5-5", 2, 100_000, 10_000],
      ["claude-haiku-5-5", 1, 100_000, 20_000],
    ]);
    expect(usage.models[0].averageUsd).toBeCloseTo(0.3);
    expect(usage.models[0].totalUsd).toBeCloseTo(0.6);
  });

  it("covers the current calendar month for the admin by default", async () => {
    await setup();
    const usage = await new CreditsService(
      await getTestDatabase()
    ).platformUsage({ now });
    expect(usage.window).toEqual(window);
  });
});
