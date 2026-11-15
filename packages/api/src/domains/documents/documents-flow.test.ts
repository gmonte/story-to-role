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
import { InstructionsRepository } from "@repo/api/domains/applications/instructions-repository";
import { InstructionsService } from "@repo/api/domains/applications/instructions-service";
import type { InstructionDecision } from "@repo/api/domains/applications/schemas/instructions";
import { runSplitInstructions } from "@repo/api/domains/applications/run-split-instructions";

import { AdaptationService } from "./adaptation/adaptation-service";
import { runAdaptDocument } from "./adaptation/run-adapt-document";
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
  const term = (text: string) =>
    terms.find((row) => cipher.decrypt(row.encryptedText) === text)!.id;
  await openings.insertFitCheck({
    openingId: opening.id,
    band: "medium",
    items: [
      {
        termId: term("Kubernetes"),
        verdict: "met",
        evidenceIds: [evidence[0].id],
        encryptedExplanation: cipher.encrypt("Runs Kubernetes"),
      },
      {
        termId: term("K8s operators"),
        verdict: "met",
        evidenceIds: [evidence[0].id],
        encryptedExplanation: cipher.encrypt("Same thing, other words"),
      },
      {
        termId: term("Go"),
        verdict: "gap",
        evidenceIds: [],
        encryptedExplanation: cipher.encrypt("No Go"),
        encryptedGapQuestion: cipher.encrypt("Have you used Go?"),
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
    reviewDepth: "quick" | "thorough",
    script: {
      drafts: ResumeDraft[];
      ratings: number[];
    }
  ) {
    const { generationId } = await documents.generateResume({
      userId: user.id,
      openingId: opening.id,
      language: "en-US",
      reviewDepth,
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
    openings,
    cipher,
    trigger,
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
        source: { kind: "position", title: "Tech Lead", employer: "Globex" },
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

  it("skips review rounds when the first draft already reaches the target", async () => {
    const ctx = await setup();
    const line = {
      text: "Led a team of 5 engineers.",
      evidence_ids: [ctx.evidence[1].id],
    };
    const { fake } = await ctx.generate("thorough", {
      drafts: [ctx.draft([line])],
      ratings: [9],
    });
    // Strategist and one review; no editor round was paid for.
    expect(fake.generateObject).toHaveBeenCalledTimes(2);
  });

  it("prints generalized employers, leaves out unusable credentials and locks credentials", async () => {
    const ctx = await setup();
    const cipher = await getUserCipher(ctx.db, ctx.user.id);
    await ctx.db.insert(sensitiveItemsTable).values({
      profileId: ctx.profile.id,
      positionId: ctx.positionId,
      kind: "client",
      encryptedOriginal: cipher.encrypt("Globex"),
      choice: "generalize",
      encryptedGeneralized: cipher.encrypt("a global tech company"),
    });
    await ctx.db.insert(credentialsTable).values({
      profileId: ctx.profile.id,
      kind: "language",
      encryptedTitle: cipher.encrypt("Klingon"),
      status: "do_not_use",
      approvedAt: new Date(),
    });
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
    expect(experienceOf(version.content).employer).toBe(
      "a global tech company"
    );
    expect(JSON.stringify(version.content)).not.toMatch(/Globex|Klingon/);

    const tampered = structuredClone(version.content);
    const languages = tampered.sections.find((s) => s.kind === "languages");
    if (languages && "entries" in languages && languages.kind === "languages") {
      languages.entries[0].level = "Native";
    }
    await expect(
      ctx.documents.saveEdit({
        userId: ctx.user.id,
        versionId: version.id,
        baseSnapshotId: version.snapshot.id,
        content: tampered,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
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

  it("splits instructions into points: promoted ones become evidence, overrides apply", async () => {
    const ctx = await setup();
    const instructions = new InstructionsService(
      ctx.db,
      new TasksService(ctx.db, ctx.trigger)
    );
    const [gapItem] = (
      await ctx.openings.listFitCheckItems(
        (await ctx.openings.latestFitChecks([ctx.opening.id]))[0].id
      )
    ).filter((item) => item.verdict === "gap");
    await ctx.openings.answerFitCheckItem({
      fitCheckItemId: gapItem.id,
      encryptedGapAnswer: ctx.cipher.encrypt("I built a CLI in Go at Globex"),
    });
    expect(
      await instructions.get({ userId: ctx.user.id, openingId: ctx.opening.id })
    ).toMatchObject({ points: [], pendingGapAnswers: 1 });

    await instructions.split({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      text: "I led the Kubernetes migration in 2021 at Initrode. Emphasize people management. In this application my title at Globex is Engineering Manager.",
    });
    expect(ctx.trigger.trigger).toHaveBeenLastCalledWith(
      "split_instructions",
      expect.anything()
    );
    const submitted = await new InstructionsRepository(
      ctx.db
    ).latestInstructions(ctx.opening.id);
    const point = {
      gap_ref: null,
      looks_like_career_fact: false,
      position_id: null,
      credential_id: null,
      evidence_kind: null,
      sensitive_items: [],
      locked_fact_change: null,
    };
    const fake = fakeProviderPackage({
      object: () => ({
        points: [
          {
            ...point,
            text: "I led the Kubernetes migration in 2021 at Initrode",
            looks_like_career_fact: true,
            position_id: ctx.positionId,
            evidence_kind: "achievement",
            sensitive_items: [
              {
                kind: "client",
                original: "Initrode",
                suggested_generalization: "a logistics company",
              },
              // Not in the point: never flagged.
              {
                kind: "person",
                original: "Bob",
                suggested_generalization: null,
              },
            ],
          },
          { ...point, text: "Emphasize people management" },
          // Rephrased, not the user's words: dropped.
          { ...point, text: "Prioritize leadership" },
          {
            ...point,
            text: "In this application my title at Globex is Engineering Manager",
            locked_fact_change: {
              position_id: ctx.positionId,
              field: "title",
              value: "Engineering Manager",
            },
          },
          {
            ...point,
            gap_ref: "gap-1",
            text: "ignored: the answer is kept as written",
            looks_like_career_fact: true,
            position_id: "not-a-position",
          },
        ],
      }),
    });
    await runSplitInstructions({
      db: ctx.db,
      ai: createAiClient({
        db: ctx.db,
        userId: ctx.user.id,
        funding: "credits",
        providerPackage: fake.providerPackage,
        sensitiveFilter: await loadSensitiveFilter({
          db: ctx.db,
          cipher: ctx.cipher,
          profileId: ctx.profile.id,
        }),
      }),
      cipher: ctx.cipher,
      userId: ctx.user.id,
      applicationInstructionsId: submitted.id,
    });

    const review = await instructions.get({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    expect(review.pendingGapAnswers).toBe(0);
    expect(
      review.points.map((row) => [
        row.text,
        row.source,
        row.suggestedPromotion,
        row.sensitiveItems.map((item) => item.original),
      ])
    ).toEqual([
      [
        "I led the Kubernetes migration in 2021 at Initrode",
        "written",
        true,
        ["Initrode"],
      ],
      ["Emphasize people management", "written", false, []],
      [
        "In this application my title at Globex is Engineering Manager",
        "written",
        false,
        [],
      ],
      // A target that is not one of the user's positions is no suggestion.
      ["I built a CLI in Go at Globex", "gap_answer", false, []],
    ]);
    expect(review.overrides).toMatchObject([
      {
        employer: "Globex",
        field: "title",
        original: "Tech Lead",
        value: "Engineering Manager",
        confirmed: false,
      },
    ]);

    // Drafts must be reviewed before generating.
    await expect(
      ctx.documents.generateResume({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
        language: "en-US",
        reviewDepth: "quick",
        writingLevel: "standard",
        tone: "direct",
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    const [migration, emphasis, titleChange, gap] = review.points;
    const decide = (
      instructionPointId: string,
      changes: Partial<InstructionDecision> = {}
    ): InstructionDecision => ({
      instructionPointId,
      promote: false,
      text: null,
      positionId: null,
      credentialId: null,
      evidenceKind: null,
      ...changes,
    });
    // A locked-fact change stays in this application: never promoted.
    await expect(
      instructions.confirm({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
        decisions: [
          decide(titleChange.id, { promote: true, positionId: ctx.positionId }),
        ],
        confirmedLockedFactOverrideIds: [],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await instructions.confirm({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      decisions: [
        decide(migration.id, {
          promote: true,
          // Edited on the approval screen; the quote keeps the original.
          text: "Led the Kubernetes migration in 2021 at Initrode",
          positionId: ctx.positionId,
          evidenceKind: "achievement",
        }),
        decide(gap.id),
      ],
      confirmedLockedFactOverrideIds: review.overrides.map((row) => row.id),
    });
    await instructions.removePoint({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      instructionPointId: emphasis.id,
    });

    const promoted = (
      await ctx.db
        .select()
        .from(evidenceTable)
        .where(eq(evidenceTable.positionId, ctx.positionId))
    ).find(
      (row) =>
        ctx.cipher.decrypt(row.encryptedText) ===
        "Led the Kubernetes migration in 2021 at Initrode"
    );
    expect(promoted).toBeDefined();
    expect(ctx.cipher.decrypt(promoted!.encryptedSourceQuote)).toBe(
      "I led the Kubernetes migration in 2021 at Initrode"
    );
    const sensitive = await ctx.db.select().from(sensitiveItemsTable);
    expect(
      sensitive.map((row) => [
        ctx.cipher.decrypt(row.encryptedOriginal),
        row.choice,
      ])
    ).toEqual([["Initrode", "generalize"]]);

    const after = await instructions.get({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    expect(after.points.map((row) => row.status)).toEqual([
      "promoted",
      "kept",
      "kept",
    ]);
    expect(after.overrides).toMatchObject([{ confirmed: true }]);

    // Kept points back lines that trace to them; the override is printed.
    await ctx.generate("quick", {
      drafts: [
        ctx.draft([
          { text: "Built a CLI in Go.", evidence_ids: [gap.id] },
          {
            text: "Led the Kubernetes migration in 2021.",
            evidence_ids: [promoted!.id],
          },
        ]),
        ctx.draft([{ text: "Built a CLI in Go.", evidence_ids: [gap.id] }]),
      ],
      ratings: [8, 5],
    });
    const [version] = (
      await ctx.documents.forOpening({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
      })
    ).documents[0].versions;
    const entry = experienceOf(version.content);
    expect(entry).toMatchObject({
      title: "Engineering Manager",
      employer: "Globex",
    });
    expect(entry.lines.map((line) => [line.text, line.origin.kind])).toEqual([
      ["Built a CLI in Go.", "instruction"],
      ["Led the Kubernetes migration in 2021.", "evidence"],
    ]);
    expect(version.instructionTrace).toEqual([
      { instructionId: gap.id, text: "I built a CLI in Go at Globex" },
    ]);

    // Removing the point that asked for an override removes the override;
    // a promoted point is evidence now and stays.
    await instructions.removePoint({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      instructionPointId: titleChange.id,
    });
    await expect(
      instructions.removePoint({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
        instructionPointId: migration.id,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await instructions.get({ userId: ctx.user.id, openingId: ctx.opening.id })
    ).toMatchObject({ overrides: [] });
  });

  it("adapts into another language, approves a title and syncs changes", async () => {
    const ctx = await setup();
    const [kubernetes, team] = ctx.evidence;
    const line = (text: string, id: string) => ({ text, evidence_ids: [id] });
    await ctx.generate("quick", {
      drafts: [
        ctx.draft([
          line("Cut deploy time by 40% with Kubernetes.", kubernetes.id),
          line("Led a team of 5 engineers.", team.id),
        ]),
        ctx.draft([line("Led a team of 5 engineers.", team.id)]),
      ],
      ratings: [8, 5],
    });
    const view = () =>
      ctx.documents.forOpening({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
      });
    const [english] = (await view()).documents[0].versions;
    const [deploy, lead] = experienceOf(english.content).lines;

    const tasks = new TasksService(ctx.db, ctx.trigger);
    const adaptation = new AdaptationService(ctx.db, tasks);
    const filter = await loadSensitiveFilter({
      db: ctx.db,
      cipher: ctx.cipher,
      profileId: ctx.profile.id,
    });
    const runWith = async (
      generationId: string,
      object: (system: string) => unknown
    ) => {
      const fake = fakeProviderPackage({
        object: ({ system }) => object(system),
      });
      await runAdaptDocument({
        db: ctx.db,
        ai: createAiClient({
          db: ctx.db,
          userId: ctx.user.id,
          funding: "credits",
          providerPackage: fake.providerPackage,
          sensitiveFilter: filter,
        }),
        cipher: ctx.cipher,
        filter,
        userId: ctx.user.id,
        generationId,
      });
      return fake;
    };

    const adapted = await adaptation.adapt({
      userId: ctx.user.id,
      versionId: english.id,
      language: "pt-BR",
    });
    const items = (team: string) => [
      {
        id: deploy.id,
        text: "Reduziu o tempo de deploy em 40% com Kubernetes.",
        label: null,
      },
      { id: lead.id, text: team, label: null },
    ];
    const fake = await runWith(adapted.generationId, (system) =>
      system.startsWith("These items")
        ? {
            title_line: "",
            items: items("Liderou uma equipe de 5 engenheiros."),
            contexts: [],
            title_equivalents: [],
          }
        : {
            title_line: "Engenheiro de Plataforma | Kubernetes",
            // A converted figure: refused, then fixed on the retry.
            items: items("Liderou uma equipe de 6 engenheiros."),
            contexts: [],
            title_equivalents: [
              { position_id: ctx.positionId, title: "Líder Técnico" },
            ],
          }
    );
    expect(fake.generateObject).toHaveBeenCalledTimes(2);

    let versions = (await view()).documents[0].versions;
    const portuguese = versions.find((v) => v.language === "pt-BR")!;
    expect(experienceOf(portuguese.content)).toMatchObject({
      title: "Tech Lead",
      lines: [
        {
          id: deploy.id,
          text: "Reduziu o tempo de deploy em 40% com Kubernetes.",
          origin: deploy.origin,
        },
        {
          id: lead.id,
          text: "Liderou uma equipe de 5 engenheiros.",
          origin: lead.origin,
        },
      ],
    });
    expect(portuguese.snapshot.origin).toBe("adapted");
    expect(portuguese.outdated).toEqual([]);
    expect(portuguese.titleProposals).toEqual([
      {
        positionId: ctx.positionId,
        current: "Tech Lead",
        proposed: "Líder Técnico",
      },
    ]);

    await adaptation.approveTitle({
      userId: ctx.user.id,
      versionId: portuguese.id,
      positionId: ctx.positionId,
      title: "Líder Técnico",
    });
    // The English version edits a line; the Portuguese one falls behind.
    await ctx.documents.saveEdit({
      userId: ctx.user.id,
      versionId: english.id,
      baseSnapshotId: english.snapshot.id,
      content: {
        ...english.content,
        sections: english.content.sections.map((section) =>
          section.kind === "experience"
            ? {
                ...section,
                entries: section.entries.map((entry) => ({
                  ...entry,
                  lines: entry.lines.map((row) =>
                    row.id === lead.id
                      ? { ...row, text: "Led and hired a team of 5 engineers." }
                      : row
                  ),
                })),
              }
            : section
        ),
      },
    });
    versions = (await view()).documents[0].versions;
    const behind = versions.find((v) => v.id === portuguese.id)!;
    expect(experienceOf(behind.content).title).toBe("Líder Técnico");
    expect(behind.titleProposals).toEqual([]);
    expect(behind.outdated).toEqual([
      {
        versionId: english.id,
        language: "en-US",
        changes: 1,
        baseMissing: false,
      },
    ]);
    // The title approval is a locked fact, not a change to carry back.
    expect(versions.find((v) => v.id === english.id)!.outdated).toEqual([]);

    const preview = await adaptation.syncPreview({
      userId: ctx.user.id,
      versionId: portuguese.id,
      fromVersionId: english.id,
    });
    expect(preview).toMatchObject({
      baseMissing: false,
      changes: [
        {
          lineId: lead.id,
          kind: "changed",
          before: "Led a team of 5 engineers.",
          after: "Led and hired a team of 5 engineers.",
          targetText: "Liderou uma equipe de 5 engenheiros.",
          conflict: false,
        },
      ],
    });
    const started = await adaptation.startSync({
      userId: ctx.user.id,
      versionId: portuguese.id,
      fromVersionId: english.id,
      sourceSnapshotId: preview.sourceSnapshotId,
      lineIds: [lead.id],
    });
    await runWith(started.generationId, () => ({
      items: [
        {
          id: lead.id,
          text: "Liderou e contratou uma equipe de 5 engenheiros.",
        },
      ],
    }));
    const { generation, proposal } = (await view()).documents[0];
    expect(generation).toMatchObject({ kind: "sync", status: "proposed" });
    expect(proposal).toEqual({
      generationId: started.generationId,
      versionId: portuguese.id,
      lines: [
        {
          lineId: lead.id,
          before: "Liderou uma equipe de 5 engenheiros.",
          after: "Liderou e contratou uma equipe de 5 engenheiros.",
        },
      ],
    });
    await adaptation.acceptSync({
      userId: ctx.user.id,
      generationId: started.generationId,
    });
    versions = (await view()).documents[0].versions;
    const synced = versions.find((v) => v.id === portuguese.id)!;
    expect(experienceOf(synced.content).lines[1].text).toBe(
      "Liderou e contratou uma equipe de 5 engenheiros."
    );
    expect(synced.outdated).toEqual([]);
    await expect(
      adaptation.acceptSync({
        userId: ctx.user.id,
        generationId: started.generationId,
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    // Undoing the sync moves its base back: the change is missing again.
    await ctx.documents.undo({ userId: ctx.user.id, versionId: portuguese.id });
    versions = (await view()).documents[0].versions;
    expect(versions.find((v) => v.id === portuguese.id)!.outdated).toEqual([
      {
        versionId: english.id,
        language: "en-US",
        changes: 1,
        baseMissing: false,
      },
    ]);
    // An adaptation is always into another language.
    await expect(
      adaptation.adapt({
        userId: ctx.user.id,
        versionId: english.id,
        language: "en-US",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
