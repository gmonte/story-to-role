import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAiClient } from "@repo/api/domains/ai/ai-client";
import {
  credentialsTable,
  positionsTable,
} from "@repo/api/domains/career/db/career-tables";
import { CareerService } from "@repo/api/domains/career/career-service";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import {
  evidenceTable,
  sensitiveItemsTable,
} from "@repo/api/domains/evidence/db/evidence-tables";
import { loadSensitiveFilter } from "@repo/api/domains/evidence/sensitive/load-sensitive-filter";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { DocumentsRepository } from "./documents-repository";
import { DocumentsService } from "./documents-service";
import type { ResumeDraft } from "./generation/assemble-resume";
import { runGenerateResume } from "./generation/run-generate-resume";
import type { ResumeContent } from "./schemas/resume-content";

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
      employer: "Globex",
      title: "Tech Lead",
      startDate: "2021-03",
    },
  });
  await db
    .update(positionsTable)
    .set({ status: "approved", approvedAt: new Date() })
    .where(eq(positionsTable.id, positionId));
  const cipher = await getUserCipher(db, user.id);
  const evidence = await db
    .insert(evidenceTable)
    .values(
      [
        ["achievement", "Cut deploy time by 40% with Kubernetes at Initrode"],
        ["responsibility", "Led a team of 5 engineers"],
      ].map(([kind, text]) => ({
        profileId: profile.id,
        positionId,
        kind: kind as "achievement" | "responsibility",
        encryptedText: cipher.encrypt(text),
        encryptedSourceQuote: cipher.encrypt(`I said: ${text}`),
        language: "en-US" as const,
        approvedAt: new Date(),
      }))
    )
    .returning();
  await db.insert(credentialsTable).values({
    profileId: profile.id,
    kind: "language",
    encryptedTitle: cipher.encrypt("English"),
    level: "C1",
    approvedAt: new Date(),
  });

  const openings = new OpeningsRepository(db);
  const opening = await openings.insertOpening({
    profileId: profile.id,
    kind: "posted",
    status: "analyzed",
    encryptedTitle: cipher.encrypt("Platform Engineer"),
    encryptedCompany: cipher.encrypt("Hooli"),
  });
  const terms = await openings.replaceTerms(
    opening.id,
    [
      ["keyword", "tool", "Kubernetes"],
      ["keyword", "tool", "K8s operators"],
      ["keyword", "tool", "Go"],
    ].map(([kind, category, text]) => ({
      openingId: opening.id,
      kind: kind as "keyword",
      category: category as "tool",
      encryptedText: cipher.encrypt(text),
    }))
  );
  await openings.insertFitCheck({
    openingId: opening.id,
    band: "medium",
    items: [
      {
        termId: terms[0].id,
        verdict: "met",
        evidenceIds: [evidence[0].id],
        encryptedExplanation: cipher.encrypt("Runs Kubernetes"),
      },
      {
        termId: terms[1].id,
        verdict: "partial",
        evidenceIds: [evidence[0].id],
        encryptedExplanation: cipher.encrypt("Adjacent"),
      },
      {
        termId: terms[2].id,
        verdict: "gap",
        evidenceIds: [],
        encryptedExplanation: cipher.encrypt("No Go"),
      },
    ],
  });

  const trigger = {
    trigger: vi.fn(async () => ({ runId: "run", accessToken: "t" })),
  };
  const documents = new DocumentsService(db, new TasksService(db, trigger));

  const draft = (bullets: ResumeDraft["experience"][number]["bullets"]) => ({
    title_line: "Platform Engineer | Kubernetes",
    summary: {
      text: "Engineer who cut deploy time by 40%.",
      evidence_ids: [evidence[0].id],
    },
    skills: [
      { label: "Core", items: ["Kubernetes"], evidence_ids: [evidence[0].id] },
    ],
    experience: [{ position_id: positionId, context: null, bullets }],
    projects: [],
  });

  async function generate(
    depth: "quick" | "thorough",
    script: {
      drafts: ResumeDraft[];
      ratings: number[];
    }
  ) {
    const { generationId } = await documents.generateResume({
      userId: user.id,
      openingId: opening.id,
      language: "en-US",
      depth,
      writingLevel: "standard",
      tone: "direct",
    });
    const drafts = [...script.drafts];
    const ratings = [...script.ratings];
    const filter = await loadSensitiveFilter({
      db,
      cipher,
      profileId: profile.id,
    });
    const fake = fakeProviderPackage({
      object: ({ system }) => {
        if (system.startsWith("You review")) {
          return { rating: ratings.shift() ?? 5, gaps: ["Be more concrete"] };
        }
        return drafts.shift();
      },
    });
    await runGenerateResume({
      db,
      ai: createAiClient({
        db,
        userId: user.id,
        funding: "credits",
        providerPackage: fake.providerPackage,
        sensitiveFilter: filter,
      }),
      cipher,
      filter,
      userId: user.id,
      generationId,
    });
    return { generationId, fake };
  }

  return {
    db,
    user,
    profile,
    positionId,
    evidence,
    opening,
    documents,
    draft,
    generate,
  };
}

const experienceOf = (content: ResumeContent) => {
  const section = content.sections.find((s) => s.kind === "experience");
  if (section?.kind !== "experience") throw new Error("no experience");
  return section.entries[0];
};

describe("resume generation and snapshots", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("generates with locked facts, evidence trace and an ATS check, keeping the best round", async () => {
    const ctx = await setup();
    const [kubernetes, team] = ctx.evidence;
    const { generationId } = await ctx.generate("quick", {
      drafts: [
        ctx.draft([
          {
            text: "Cut deploy time by 40% with Kubernetes.",
            evidence_ids: [kubernetes.id],
          },
        ]),
        ctx.draft([
          {
            text: "Cut deploy time by 40% with Kubernetes.",
            evidence_ids: [kubernetes.id],
          },
          { text: "Led a team of 5 engineers.", evidence_ids: [team.id] },
          { text: "Saved $2M a year.", evidence_ids: [team.id] },
        ]),
      ],
      ratings: [6, 8],
    });

    const view = await ctx.documents.forOpening({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    expect(view.application).toMatchObject({
      status: "in_preparation",
      tone: "direct",
    });
    const [resume] = view.documents;
    expect(resume.generation).toMatchObject({ status: "completed" });
    const [version] = resume.versions;
    expect(version.snapshot).toMatchObject({
      sequence: 1,
      origin: "generated",
      author: "ai",
    });

    const entry = experienceOf(version.content);
    expect(entry).toMatchObject({
      employer: "Globex",
      title: "Tech Lead",
      startDate: "2021-03",
    });
    // The edited draft won (rating 8); its invented figure was dropped.
    expect(entry.lines.map((line) => line.text)).toEqual([
      "Cut deploy time by 40% with Kubernetes.",
      "Led a team of 5 engineers.",
    ]);
    expect(version.content.sections.map((s) => s.kind)).toEqual([
      "summary",
      "skills",
      "experience",
      "languages",
    ]);
    expect(version.pages).toBeLessThanOrEqual(2);

    // Every line traces to evidence with the user's quote.
    expect(entry.lines.every((line) => line.origin.kind === "evidence")).toBe(
      true
    );
    expect(version.trace).toContainEqual(
      expect.objectContaining({
        evidenceId: team.id,
        quote: "I said: Led a team of 5 engineers",
        source: "Tech Lead · Globex",
      })
    );
    expect(version.atsCheck).toEqual({
      matched: ["Kubernetes"],
      useOpeningTerm: ["K8s operators"],
      realGaps: ["Go"],
      total: 3,
    });

    const rounds = await new DocumentsRepository(ctx.db).listReviewRounds(
      generationId
    );
    expect(rounds.map((r) => [r.round, r.rating, r.kept])).toEqual([
      [0, 6, false],
      [1, 8, true],
    ]);
  });

  it("stops Thorough early once the target rating is reached", async () => {
    const ctx = await setup();
    const line = {
      text: "Led a team of 5 engineers.",
      evidence_ids: [ctx.evidence[1].id],
    };
    const { generationId, fake } = await ctx.generate("thorough", {
      drafts: [ctx.draft([line]), ctx.draft([line]), ctx.draft([line])],
      ratings: [5, 9, 10],
    });
    const rounds = await new DocumentsRepository(ctx.db).listReviewRounds(
      generationId
    );
    expect(rounds.map((r) => r.rating)).toEqual([5, 9]);
    // Strategist, one editor, two reviews.
    expect(fake.generateObject).toHaveBeenCalledTimes(4);
  });

  it("never lets an excluded name through, even in the best draft", async () => {
    const ctx = await setup();
    await ctx.db.insert(sensitiveItemsTable).values({
      profileId: ctx.profile.id,
      positionId: ctx.positionId,
      kind: "client",
      encryptedOriginal: (await getUserCipher(ctx.db, ctx.user.id)).encrypt(
        "Initrode"
      ),
      choice: "exclude",
    });
    await ctx.generate("quick", {
      drafts: [
        ctx.draft([
          {
            text: "Led a team of 5 engineers at Initrode.",
            evidence_ids: [ctx.evidence[1].id],
          },
        ]),
        ctx.draft([
          {
            text: "Led a team of 5 engineers at Initrode.",
            evidence_ids: [ctx.evidence[1].id],
          },
        ]),
      ],
      ratings: [7, 7],
    });
    const view = await ctx.documents.forOpening({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    const content = view.documents[0].versions[0].content;
    expect(JSON.stringify(content)).not.toContain("Initrode");
    // The evidence resting on the excluded client never entered the prompt.
    expect(
      view.documents[0].versions[0].trace.map((t) => t.evidenceId)
    ).not.toContain(ctx.evidence[0].id);
  });

  it("keeps snapshots as a stack: edits, undo, restore, duplicate", async () => {
    const ctx = await setup();
    const line = {
      text: "Led a team of 5 engineers.",
      evidence_ids: [ctx.evidence[1].id],
    };
    await ctx.generate("quick", {
      drafts: [ctx.draft([line]), ctx.draft([line])],
      ratings: [7, 6],
    });
    const load = async () =>
      (
        await ctx.documents.forOpening({
          userId: ctx.user.id,
          openingId: ctx.opening.id,
        })
      ).documents[0].versions;
    const [version] = await load();
    const first = version.snapshot.id;

    // An edited line becomes "written by you"; untouched lines keep their origin.
    const edited = structuredClone(version.content);
    experienceOf(edited).lines[0].text =
      "Led and mentored a team of 5 engineers.";
    await ctx.documents.saveEdit({
      userId: ctx.user.id,
      versionId: version.id,
      baseSnapshotId: first,
      content: edited,
    });
    let [current] = await load();
    expect(current.snapshot).toMatchObject({
      sequence: 2,
      origin: "edited",
      author: "user",
    });
    expect(experienceOf(current.content).lines[0].origin).toEqual({
      kind: "manual",
    });
    expect(current.content.sections[0]).toMatchObject({
      line: { origin: { kind: "evidence" } },
    });

    // A stale base is refused; so is editing a locked fact.
    await expect(
      ctx.documents.saveEdit({
        userId: ctx.user.id,
        versionId: version.id,
        baseSnapshotId: first,
        content: edited,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const tampered = structuredClone(current.content);
    experienceOf(tampered).title = "CTO";
    await expect(
      ctx.documents.saveEdit({
        userId: ctx.user.id,
        versionId: version.id,
        baseSnapshotId: current.snapshot.id,
        content: tampered,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Undo removes only the latest; the official snapshot is always the latest.
    await ctx.documents.undo({ userId: ctx.user.id, versionId: version.id });
    [current] = await load();
    expect(current.snapshot.id).toBe(first);
    expect(current.snapshotCount).toBe(1);
    await expect(
      ctx.documents.undo({ userId: ctx.user.id, versionId: version.id })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    // Restore creates a new latest snapshot; history lists the stack.
    await ctx.documents.restore({ userId: ctx.user.id, snapshotId: first });
    const history = await ctx.documents.history({
      userId: ctx.user.id,
      versionId: version.id,
    });
    expect(history.map((s) => [s.sequence, s.origin])).toEqual([
      [2, "restored"],
      [1, "generated"],
    ]);

    // Duplicate is an independent version in the same language.
    const { versionId } = await ctx.documents.duplicate({
      userId: ctx.user.id,
      versionId: version.id,
    });
    const versions = await load();
    expect(versions.map((v) => [v.id, v.label, v.language])).toEqual([
      [version.id, null, "en-US"],
      [versionId, "copy", "en-US"],
    ]);
    await ctx.documents.deleteVersion({ userId: ctx.user.id, versionId });
    expect(await load()).toHaveLength(1);
  });

  it("refuses another user's versions", async () => {
    const ctx = await setup();
    const line = {
      text: "Led a team of 5 engineers.",
      evidence_ids: [ctx.evidence[1].id],
    };
    await ctx.generate("quick", {
      drafts: [ctx.draft([line]), ctx.draft([line])],
      ratings: [7, 6],
    });
    const [version] = (
      await ctx.documents.forOpening({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
      })
    ).documents[0].versions;
    const stranger = await createTestUser("eve@example.com");
    await new CareerService(ctx.db, {
      start: vi.fn(),
    } as never).getOrCreateProfile({
      userId: stranger.id,
      defaultLanguage: "en-US",
    });
    await expect(
      ctx.documents.undo({ userId: stranger.id, versionId: version.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      ctx.documents.forOpening({
        userId: stranger.id,
        openingId: ctx.opening.id,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
