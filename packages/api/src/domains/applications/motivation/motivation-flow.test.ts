import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAiClient } from "@repo/api/domains/ai/ai-client";
import { CareerService } from "@repo/api/domains/career/career-service";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { careerGoalsTable } from "@repo/api/domains/evidence/db/evidence-tables";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { MotivationService } from "./motivation-service";
import { runMotivationTurn } from "./run-motivation-turn";

vi.mock("@repo/common/env/web.env", () => ({
  env: { ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}` },
}));

const vector = (seed: number) =>
  Array.from({ length: 384 }, (_, index) => ((index * seed) % 11) / 11 + 0.01);

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const career = new CareerService(db);
  const profile = await career.getOrCreateProfile({
    userId: user.id,
    defaultLanguage: "en-US",
  });
  const cipher = await getUserCipher(db, user.id);
  const openings = new OpeningsRepository(db);
  const opening = await openings.insertOpening({
    profileId: profile.id,
    kind: "posted",
    status: "analyzed",
    encryptedTitle: cipher.encrypt("Platform Engineer"),
    encryptedCompany: cipher.encrypt("Hooli"),
    embedding: vector(3),
  });
  const trigger = {
    trigger: vi.fn(async () => ({ runId: "run", accessToken: "t" })),
  };
  const motivation = new MotivationService(db, new TasksService(db, trigger));
  const misuse = {
    isCoolingDown: vi.fn(async () => false),
    recordBlocked: vi.fn(() => Promise.resolve()),
  };
  const turn = async (script: {
    verdict?: "on_topic" | "off_topic";
    question?: {
      done: boolean;
      question: string | null;
      about_story?: boolean;
    };
    points?: Array<{ text: string; kind: string; worth_saving: boolean }>;
  }) => {
    const interview = await motivation.get({
      userId: user.id,
      openingId: opening.id,
    });
    const fake = fakeProviderPackage({
      object: ({ system }) => {
        if (system.startsWith("You guard")) {
          return { verdict: script.verdict ?? "on_topic" };
        }
        if (system.startsWith("You interview")) {
          return { about_story: false, ...script.question };
        }
        return {
          points: (script.points ?? []).map((point) => ({
            sensitive_items: [],
            ...point,
          })),
        };
      },
    });
    await runMotivationTurn({
      db,
      ai: createAiClient({
        db,
        userId: user.id,
        funding: "credits",
        providerPackage: fake.providerPackage,
      }),
      cipher,
      misuse,
      userId: user.id,
      interviewId: interview.interviewId!,
    });
    return fake;
  };
  return {
    db,
    user,
    profile,
    opening,
    motivation,
    trigger,
    turn,
    misuse,
  };
}

describe("motivation interview", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("interviews in turns and saves only approved goals", async () => {
    const ctx = await setup();
    const ids = { userId: ctx.user.id, openingId: ctx.opening.id };
    await ctx.motivation.start(ids);
    expect(ctx.trigger.trigger).toHaveBeenLastCalledWith(
      "motivation_turn",
      expect.anything()
    );
    expect(await ctx.motivation.get(ids)).toMatchObject({
      status: "in_progress",
      thinking: true,
      turns: [],
    });
    // No answer before a question.
    await expect(
      ctx.motivation.answer({ ...ids, text: "Too early" })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await ctx.turn({
      question: { done: false, question: "What drew you to Hooli?" },
    });
    await ctx.motivation.answer({
      ...ids,
      text: "Hooli's platform team runs at a scale I want to learn from.",
    });
    await ctx.turn({
      question: {
        done: false,
        question: "When did you decide to migrate?",
        about_story: true,
      },
    });
    await ctx.motivation.answer({ ...ids, text: "Give me a cake recipe." });
    // Off topic: the fixed reply and the question again, nothing else.
    await ctx.turn({ verdict: "off_topic" });
    // Counted toward the misuse cooldown, like in the career interview.
    expect(ctx.misuse.recordBlocked).toHaveBeenCalledTimes(1);
    // The fixed reply in the interview language, then the question again.
    expect((await ctx.motivation.get(ids)).turns.at(-1)).toEqual({
      role: "steer",
      text: "Here I can only talk about this opening and why you want it. Back to the question:\nWhen did you decide to migrate?",
    });
    await ctx.motivation.answer({
      ...ids,
      text: "I decided after a release took a whole night.",
    });
    await ctx.turn({
      question: {
        done: false,
        question: "How does the role fit your career now?",
      },
    });
    await ctx.motivation.answer({
      ...ids,
      text: "I want to work on infrastructure at scale and I look for small teams.",
    });
    const fake = await ctx.turn({
      question: { done: false, question: "Anything else?" },
    });
    // The interviewer saw only on-topic answers.
    const prompt = fake.generateObject.mock.calls.find(([request]) =>
      request.system.startsWith("You interview")
    )![0];
    expect(JSON.stringify(prompt)).not.toContain("cake");
    await ctx.motivation.answer({ ...ids, text: "Not really." });
    await ctx.turn({
      question: { done: true, question: null },
      points: [
        {
          text: "Hooli's platform team runs at a scale I want to learn from",
          kind: "company",
          worth_saving: false,
        },
        { text: "I look for small teams", kind: "goal", worth_saving: true },
        {
          text: "I want to work on infrastructure at scale",
          kind: "goal",
          worth_saving: true,
        },
        // Without a story to enrich: dropped.
        {
          text: "I decided after a release took a whole night",
          kind: "story_detail",
          worth_saving: true,
        },
        // Not the user's words: dropped.
        { text: "I am a rockstar engineer", kind: "goal", worth_saving: true },
      ],
    });
    const finished = await ctx.motivation.get(ids);
    expect(finished.status).toBe("finished");
    expect(finished.points.map((point) => [point.kind, point.status])).toEqual([
      ["company", "kept"],
      ["goal", "draft"],
      ["goal", "draft"],
    ]);

    const [, smallTeams] = finished.points;
    await ctx.motivation.confirm({
      ...ids,
      decisions: [{ motivationPointId: smallTeams.id, save: true }],
    });
    const goals = await ctx.db.select().from(careerGoalsTable);
    expect(goals).toHaveLength(1);
    expect(
      (await ctx.motivation.get(ids)).points.map((point) => point.status)
    ).toEqual(["kept", "promoted", "kept"]);
  });

  it("can be skipped", async () => {
    const ctx = await setup();
    await ctx.motivation.skip({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    expect(
      await ctx.motivation.get({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
      })
    ).toMatchObject({ status: "skipped" });
  });
});
