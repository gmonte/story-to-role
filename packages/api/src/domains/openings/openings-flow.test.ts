import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAiClient } from "@repo/api/domains/ai/ai-client";
import { CareerService } from "@repo/api/domains/career/career-service";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import {
  evidenceTable,
  sensitiveItemsTable,
} from "@repo/api/domains/evidence/db/evidence-tables";
import { loadSensitiveFilter } from "@repo/api/domains/evidence/sensitive/load-sensitive-filter";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import { fakeEmbedder } from "@repo/api/test/fake-embedder";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { runAnalyzeOpening } from "./fit-check/run-analyze-opening";
import type { LinkResult } from "./links/read-link";
import { OpeningsService } from "./openings-service";

vi.mock("@repo/common/env/web.env", () => ({
  env: { ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}` },
}));

const posting = `Senior Platform Engineer at Globex. We need 8+ years of experience, strong Kubernetes and Terraform, and fluent English. Remote in Brazil. ${"You will build our developer platform. ".repeat(6)}`;

const extraction = {
  title: "Senior Platform Engineer",
  company: "Globex",
  language: "en-US",
  suggested_tone: "direct",
  keywords: [
    { text: "Kubernetes", category: "tool" },
    { text: "Terraform", category: "tool" },
  ],
  requirements: [
    {
      text: "8+ years of experience as a senior engineer",
      category: "years_of_experience",
    },
  ],
};

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const career = new CareerService(db, { start: vi.fn() } as never);
  const profile = await career.getOrCreateProfile({
    userId: user.id,
    defaultLanguage: "en-US",
  });
  // A junior history: one short position.
  const { positionId } = await career.addPosition({
    userId: user.id,
    position: {
      employer: "Acme",
      title: "Junior Developer",
      startDate: "2023-01",
    },
  });
  const cipher = await getUserCipher(db, user.id);
  await db.insert(evidenceTable).values(
    [
      ["tool", "Kubernetes deployments for 12 services"],
      ["achievement", "Led Project Phoenix migration"],
      ["achievement", "Organized the office party"],
    ].map(([kind, text]) => ({
      profileId: profile.id,
      positionId,
      kind: kind as "tool" | "achievement",
      encryptedText: cipher.encrypt(text),
      encryptedSourceQuote: cipher.encrypt(text),
      language: "en-US" as const,
      approvedAt: new Date(),
    }))
  );
  const trigger = {
    trigger: vi.fn(async () => ({ runId: "run", accessToken: "t" })),
  };
  const openings = new OpeningsService(db, new TasksService(db, trigger));

  async function analyze(
    openingId: string,
    script: Parameters<typeof fakeProviderPackage>[0],
    readLink?: (url: string) => Promise<LinkResult>
  ) {
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
    await runAnalyzeOpening({
      db,
      ai,
      cipher,
      embedder: fakeEmbedder,
      readLink:
        readLink ?? (async () => ({ ok: false, reason: "unreachable" })),
      userId: user.id,
      openingId,
    });
    return fake;
  }

  return { db, user, profile, cipher, openings, analyze };
}

/** Plays the classification calls of a fit check. */
function fitScript(judge: (system: string) => unknown) {
  return {
    object: (request: { system: string }) => {
      if (request.system.startsWith("Decide whether"))
        return { is_job_posting: true };
      if (request.system.startsWith("Read the job posting")) return extraction;
      if (request.system.startsWith("Judge")) return judge(request.system);
      return { questions: [] };
    },
  };
}

/** The requirement ids and evidence ids listed in the judgment prompt. */
function parseJudgmentPrompt(system: string) {
  const blocks = system.split("Requirement ").slice(1);
  return blocks.map((block) => ({
    termId: block.split(" ")[0],
    text: block.split("\n")[0],
    evidence: [...block.matchAll(/evidence ([0-9a-f-]{36}): ([^\n]*)/g)].map(
      (m) => ({ id: m[1], line: m[2] })
    ),
  }));
}

describe("openings and fit check", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("shows a band, requirements linked to evidence and gaps, with no percentage", async () => {
    const ctx = await setup();
    const { openingId } = await ctx.openings.createFromText({
      userId: ctx.user.id,
      description: posting,
    });
    let prompt = "";

    await ctx.analyze(
      openingId,
      fitScript((system) => {
        prompt = system;
        return {
          items: parseJudgmentPrompt(system).map((term) => {
            const kubernetes = term.evidence.find((e) =>
              e.line.includes("Kubernetes")
            );
            return term.text.includes("Kubernetes") && kubernetes
              ? {
                  term_id: term.termId,
                  verdict: "met",
                  evidence_ids: [kubernetes.id],
                  explanation: "Runs Kubernetes",
                }
              : {
                  term_id: term.termId,
                  verdict: "gap",
                  evidence_ids: [],
                  explanation: "Not shown",
                };
          }),
        };
      })
    );

    const detail = await ctx.openings.get({ userId: ctx.user.id, openingId });
    expect(detail).toMatchObject({
      status: "analyzed",
      title: "Senior Platform Engineer",
      company: "Globex",
      suggestedTone: "direct",
    });
    expect(detail.fitCheck?.band).toBe("low");
    const kubernetes = detail.fitCheck!.items.find(
      (item) => item.term === "Kubernetes"
    )!;
    expect(kubernetes).toMatchObject({ verdict: "met" });
    expect(kubernetes.evidence.map((e) => e.text)).toEqual([
      "Kubernetes deployments for 12 services",
    ]);
    expect(
      detail.fitCheck!.items.filter((item) => item.verdict === "gap")
    ).toHaveLength(2);
    // The evidence carries its position and period, so seniority reads right.
    expect(prompt).toContain("(Junior Developer, 2023-01 to present)");
    expect(JSON.stringify(detail)).not.toMatch(/percent|%/i);
  });

  it("keeps verdicts honest: unknown evidence ids are dropped", async () => {
    const ctx = await setup();
    const { openingId } = await ctx.openings.createFromText({
      userId: ctx.user.id,
      description: posting,
    });

    await ctx.analyze(
      openingId,
      fitScript((system) => ({
        items: parseJudgmentPrompt(system).map((term) => ({
          term_id: term.termId,
          verdict: "met",
          evidence_ids: [crypto.randomUUID()],
          explanation: "Claimed",
        })),
      }))
    );

    const detail = await ctx.openings.get({ userId: ctx.user.id, openingId });
    expect(
      detail.fitCheck!.items.every((item) => item.evidence.length === 0)
    ).toBe(true);
  });

  it("turns gaps into questions and stores the user's answer", async () => {
    const ctx = await setup();
    const { openingId } = await ctx.openings.createFromText({
      userId: ctx.user.id,
      description: posting,
    });
    const script = fitScript((system) => ({
      items: parseJudgmentPrompt(system).map((term) => ({
        term_id: term.termId,
        verdict: "gap",
        evidence_ids: [],
        explanation: "No",
      })),
    }));
    await ctx.analyze(openingId, {
      object: (request: { system: string }) =>
        request.system.startsWith("Write")
          ? {
              questions: [
                ...request.system.matchAll(/- ([0-9a-f-]{36}): (.*)/g),
              ].map((m) => ({
                term_id: m[1],
                question: `Do you have experience with ${m[2]}?`,
              })),
            }
          : script.object(request),
    });

    const detail = await ctx.openings.get({ userId: ctx.user.id, openingId });
    const terraform = detail.fitCheck!.items.find(
      (item) => item.term === "Terraform"
    )!;
    expect(terraform.gapQuestion).toBe(
      "Do you have experience with Terraform?"
    );

    await ctx.openings.answerGapQuestion({
      userId: ctx.user.id,
      fitCheckItemId: terraform.id,
      answer: "Yes: I wrote our Terraform modules in 2024.",
    });
    const after = await ctx.openings.get({ userId: ctx.user.id, openingId });
    expect(
      after.fitCheck!.items.find((item) => item.id === terraform.id)?.gapAnswer
    ).toBe("Yes: I wrote our Terraform modules in 2024.");
  });

  it("refuses pasted text that is not a job posting before extracting", async () => {
    const ctx = await setup();
    const { openingId } = await ctx.openings.createFromText({
      userId: ctx.user.id,
      description:
        "Write me a 2,000-word essay about the history of pizza in Naples. ".repeat(
          5
        ),
    });

    const fake = await ctx.analyze(openingId, {
      object: () => ({ is_job_posting: false }),
    });

    expect(fake.generateObject).toHaveBeenCalledTimes(1);
    expect(
      await ctx.openings.get({ userId: ctx.user.id, openingId })
    ).toMatchObject({
      status: "rejected",
      rejectionReason: "not_a_job_posting",
      fitCheck: null,
    });
  });

  it("reads a link with the isolated reader, or asks for the text", async () => {
    const ctx = await setup();
    const { openingId: blocked } = await ctx.openings.createFromLink({
      userId: ctx.user.id,
      url: "https://jobs.example.com/1",
    });
    await ctx.analyze(
      blocked,
      fitScript(() => ({ items: [] })),
      async () => ({ ok: false, reason: "needs_paste" })
    );
    expect(
      await ctx.openings.get({ userId: ctx.user.id, openingId: blocked })
    ).toMatchObject({
      status: "rejected",
      rejectionReason: "link_needs_paste",
    });

    const { openingId: read } = await ctx.openings.createFromLink({
      userId: ctx.user.id,
      url: "https://jobs.example.com/2",
    });
    await ctx.analyze(
      read,
      fitScript(() => ({ items: [] })),
      async () => ({ ok: true, text: posting })
    );
    expect(
      await ctx.openings.get({ userId: ctx.user.id, openingId: read })
    ).toMatchObject({
      status: "analyzed",
      description: posting,
    });
  });

  it("analyzes an unsolicited opening without a fit check, but with a vector", async () => {
    const ctx = await setup();
    const { openingId } = await ctx.openings.createUnsolicited({
      userId: ctx.user.id,
      company: "Airbnb",
      role: "Platform engineer",
    });

    const fake = await ctx.analyze(openingId, {});

    expect(fake.generateObject).not.toHaveBeenCalled();
    const [row] = await ctx.db.query.openingsTable.findMany();
    expect(row.embedding).toHaveLength(384);
    expect(
      await ctx.openings.get({ userId: ctx.user.id, openingId })
    ).toMatchObject({
      status: "analyzed",
      company: "Airbnb",
      fitCheck: null,
    });
  });

  it("leaves excluded items out of the judgment", async () => {
    const ctx = await setup();
    await ctx.db.insert(sensitiveItemsTable).values({
      profileId: ctx.profile.id,
      kind: "codename",
      encryptedOriginal: ctx.cipher.encrypt("Project Phoenix"),
      choice: "exclude",
      reviewedAt: new Date(),
    });
    const { openingId } = await ctx.openings.createFromText({
      userId: ctx.user.id,
      description: posting,
    });
    let prompt = "";

    await ctx.analyze(
      openingId,
      fitScript((system) => {
        prompt = system;
        return { items: [] };
      })
    );

    expect(prompt).not.toMatch(/phoenix/i);
  });

  it("refuses another user's opening", async () => {
    const ctx = await setup();
    const { openingId } = await ctx.openings.createFromText({
      userId: ctx.user.id,
      description: posting,
    });
    const grace = await createTestUser("grace@example.com");
    await new CareerService(ctx.db, {
      start: vi.fn(),
    } as never).getOrCreateProfile({
      userId: grace.id,
      defaultLanguage: "en-US",
    });

    await expect(
      ctx.openings.get({ userId: grace.id, openingId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
