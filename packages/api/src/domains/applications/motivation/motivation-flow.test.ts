import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAiClient } from "@repo/api/domains/ai/ai-client";
import { CareerService } from "@repo/api/domains/career/career-service";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadProfileSource } from "@repo/api/domains/documents/generation/load-profile-source";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import { ProfileService } from "@repo/api/domains/profile/profile-service";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";
import type * as SuggestLineModule from "@repo/api/domains/profile/suggestions/suggest-line";
import { suggestLine } from "@repo/api/domains/profile/suggestions/suggest-line";

import { MotivationService } from "./motivation-service";
import { runMotivationTurn } from "./run-motivation-turn";

// The real suggestion, which a test can make fail once.
vi.mock(
  "@repo/api/domains/profile/suggestions/suggest-line",
  async (importOriginal) => {
    const original = await importOriginal<typeof SuggestLineModule>();
    return { ...original, suggestLine: vi.fn(original.suggestLine) };
  }
);

vi.mock("@repo/common/env/web.env", () => ({
  env: { ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}` },
}));

const vector = (seed: number) =>
  Array.from({ length: 384 }, (_, index) => ((index * seed) % 11) / 11 + 0.01);

const profileMarkdown = `# Profile

## Professional identity

- Professional name: Ada Lovelace
- Career direction (what I look for): Platform work at scale.

## Contact (only what may appear on a resume)

- City and state: Belo Horizonte, MG

## Experience (most recent first)

### Globex — Tech Lead (2021-03 to present)

- Tools: Kubernetes
- Results:
  - Cut deploy time by 40% with Kubernetes [measured: CI dashboard].

## Education

## Certifications

## Competencies

- I master: Kubernetes

## Languages

## Known gaps

## Communication rules
`;

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
  const tasks = new TasksService(db, trigger);
  const motivation = new MotivationService(db, tasks);
  const profiles = new ProfileService(db, tasks);
  const current = await profiles.getDraft({
    userId: user.id,
    language: "en-US",
  });
  const { revision } = await profiles.saveDraft({
    userId: user.id,
    markdown: profileMarkdown,
    baseRevision: current.revision,
  });
  await profiles.publish({ userId: user.id, baseRevision: revision });
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
    profiles,
    cipher,
    trigger,
    turn,
    misuse,
  };
}

describe("motivation interview", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  /** Runs an interview to its end with the points the model proposes. */
  async function finishInterview(
    ctx: Awaited<ReturnType<typeof setup>>,
    points: Array<{ text: string; kind: string; worth_saving: boolean }>
  ) {
    const ids = { userId: ctx.user.id, openingId: ctx.opening.id };
    await ctx.motivation.start(ids);
    for (const question of ["Why Hooli?", "Your goals?", "Fit?", "More?"]) {
      await ctx.turn({ question: { done: false, question } });
      await ctx.motivation.answer({
        ...ids,
        text: "I look for small teams.",
      });
    }
    await ctx.turn({ question: { done: true, question: null }, points });
    return ids;
  }

  it("keeps the profile's never-include terms out of the career direction the interviewer sees", async () => {
    const ctx = await setup();
    const draft = await ctx.profiles.getDraft({
      userId: ctx.user.id,
      language: "en-US",
    });
    const { revision } = await ctx.profiles.saveDraft({
      userId: ctx.user.id,
      markdown: profileMarkdown
        .replace("Platform work at scale.", "Platform work at Initrode.")
        .replace(
          "## Communication rules\n",
          "## Communication rules\n\n- Never include: Initrode\n"
        ),
      baseRevision: draft.revision,
    });
    await ctx.profiles.publish({ userId: ctx.user.id, baseRevision: revision });
    await ctx.motivation.start({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    const fake = await ctx.turn({
      question: { done: false, question: "Why Hooli?" },
    });
    const prompt = fake.generateObject.mock.calls.find(([request]) =>
      request.system.startsWith("You interview")
    )![0];
    expect(JSON.stringify(prompt)).not.toContain("Initrode");
    expect(JSON.stringify(prompt)).toContain("careerDirectionInProfile");
  });

  it("marks a point promoted only once its suggestion exists, so a failure can be retried", async () => {
    const ctx = await setup();
    const ids = await finishInterview(ctx, [
      { text: "I look for small teams", kind: "goal", worth_saving: true },
    ]);
    const [goal] = (await ctx.motivation.get(ids)).points;
    vi.mocked(suggestLine).mockRejectedValueOnce(new Error("boom"));
    await expect(
      ctx.motivation.confirm({
        ...ids,
        decisions: [{ motivationPointId: goal.id, save: true }],
      })
    ).rejects.toThrow("boom");
    expect(
      (await ctx.motivation.get(ids)).points.map((point) => point.status)
    ).toEqual(["kept"]);
    const { sent } = await ctx.motivation.confirm({
      ...ids,
      decisions: [{ motivationPointId: goal.id, save: true }],
    });
    expect(sent).toHaveLength(1);
    expect(
      (await ctx.motivation.get(ids)).points.map((point) => point.status)
    ).toEqual(["promoted"]);
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("interviews in turns and suggests only approved goals to the career direction", async () => {
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
    const draftBefore = (
      await ctx.profiles.getDraft({ userId: ctx.user.id, language: "en-US" })
    ).markdown;
    const { sent } = await ctx.motivation.confirm({
      ...ids,
      decisions: [{ motivationPointId: smallTeams.id, save: true }],
    });
    // A suggestion under the career direction line, not a change.
    expect(sent).toHaveLength(1);
    expect(await ctx.profiles.listSuggestions(ctx.user.id)).toEqual([
      expect.objectContaining({
        id: sent[0].profileSuggestionId,
        origin: "application",
        part: "identity",
        find: "- Career direction (what I look for): Platform work at scale.",
        replace:
          "- Career direction (what I look for): Platform work at scale.\n  - I look for small teams",
      }),
    ]);
    expect(
      (await ctx.profiles.getDraft({ userId: ctx.user.id, language: "en-US" }))
        .markdown
    ).toBe(draftBefore);
    expect(
      (await ctx.motivation.get(ids)).points.map((point) => point.status)
    ).toEqual(["kept", "promoted", "kept"]);
  });

  it("suggests a saved detail of the chosen story for that story's experience", async () => {
    const ctx = await setup();
    const ids = { userId: ctx.user.id, openingId: ctx.opening.id };
    const source = await loadProfileSource({
      db: ctx.db,
      cipher: ctx.cipher,
      profileId: ctx.profile.id,
    });
    const story = source?.evidence.find((line) => line.kind === "achievement");
    if (!story) throw new Error("The profile tells no story");
    // Only a line of the profile can be the story.
    await expect(
      ctx.motivation.start({ ...ids, storyLineId: "nope" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await ctx.motivation.start({ ...ids, storyLineId: story.id });
    await ctx.turn({
      question: {
        done: false,
        question: "When did you decide to migrate?",
        about_story: true,
      },
    });
    await ctx.motivation.answer({
      ...ids,
      text: "I decided after a release took a whole night.",
    });
    await ctx.turn({ question: { done: false, question: "Why Hooli?" } });
    await ctx.motivation.answer({ ...ids, text: "I like the platform." });
    await ctx.turn({ question: { done: false, question: "And your goals?" } });
    await ctx.motivation.answer({ ...ids, text: "Small teams." });
    await ctx.turn({ question: { done: false, question: "Anything else?" } });
    await ctx.motivation.answer({ ...ids, text: "Not really." });
    await ctx.turn({
      question: { done: true, question: null },
      points: [
        {
          text: "I decided after a release took a whole night",
          kind: "story_detail",
          worth_saving: true,
        },
      ],
    });
    const [detail] = (await ctx.motivation.get(ids)).points;
    expect(detail).toMatchObject({ kind: "story_detail", status: "draft" });
    const { sent } = await ctx.motivation.confirm({
      ...ids,
      decisions: [{ motivationPointId: detail.id, save: true }],
    });
    expect(await ctx.profiles.listSuggestions(ctx.user.id)).toMatchObject([
      {
        id: sent[0].profileSuggestionId,
        part: "experience:globex — tech lead",
        replace:
          "  - Cut deploy time by 40% with Kubernetes [measured: CI dashboard].\n  - I decided after a release took a whole night",
      },
    ]);
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
