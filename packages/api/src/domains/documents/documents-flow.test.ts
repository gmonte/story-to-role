import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { unzipSync } from "fflate";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAiClient } from "@repo/api/domains/ai/ai-client";
import {
  credentialsTable,
  positionsTable,
} from "@repo/api/domains/career/db/career-tables";
import { CareerService } from "@repo/api/domains/career/career-service";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { sensitiveItemsTable } from "@repo/api/domains/evidence/db/evidence-tables";
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
import { MotivationRepository } from "@repo/api/domains/applications/motivation/motivation-repository";
import { ResearchRepository } from "@repo/api/domains/applications/research/research-repository";
import { runSplitInstructions } from "@repo/api/domains/applications/run-split-instructions";
import { createLocalStorage } from "@repo/api/tools/storage/local-storage";

import { AdaptationService } from "./adaptation/adaptation-service";
import { LibraryService } from "./library/library-service";
import { embedStaleVersions } from "./similar/embed-versions";
import { runAdaptDocument } from "./adaptation/run-adapt-document";
import type { LetterDraft } from "./letter/assemble-letter";
import { LetterService } from "./letter/letter-service";
import { runGenerateLetter } from "./letter/run-generate-letter";
import { runUpdateLetter } from "./letter/run-update-letter";
import type { CoverLetterContent } from "./schemas/cover-letter-content";
import { DocumentsRepository } from "./documents-repository";
import { DocumentsService } from "./documents-service";
import type { ResumeDraft } from "./generation/assemble-resume";
import { runGenerateResume } from "./generation/run-generate-resume";
import { PdfService } from "./rendering/pdf-service";
import { runRenderPdf } from "./rendering/run-render-pdf";
import type { DocumentContent } from "./schemas/document-content";
import type { ResumeContent } from "./schemas/resume-content";

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
  // Profile_truth replaces this in P6 (docs/plan.md): no evidence exists,
  // so these ids back nothing and code drops the lines citing them.
  const evidence = [{ id: crypto.randomUUID() }, { id: crypto.randomUUID() }];
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

  /**
   * Points the user kept for this application: until profile_truth (P6),
   * the only source a resume line can rest on.
   */
  async function keepInstructions(texts: string[]) {
    const repository = new InstructionsRepository(db);
    await repository.insertPoints(
      texts.map((text, index) => ({
        profileId: profile.id,
        openingId: opening.id,
        source: "written" as const,
        sequence: index + 1,
        encryptedText: cipher.encrypt(text),
        status: "kept" as const,
        confirmedAt: new Date(),
      }))
    );
    const points = await repository.listPoints(opening.id);
    return texts.map(
      (text) =>
        points.find((point) => cipher.decrypt(point.encryptedText) === text)!
    );
  }

  const trigger = {
    trigger: vi.fn(async () => ({ runId: "run", accessToken: "t" })),
  };
  const documents = new DocumentsService(db, new TasksService(db, trigger));

  // `sourceId` backs the summary and skills: a kept point's id, or by
  // default one that backs nothing.
  const draft = (
    bullets: ResumeDraft["experience"][number]["bullets"],
    sourceId = evidence[0].id
  ) => ({
    title_line: "Platform Engineer | Kubernetes",
    summary: {
      text: "Engineer who cut deploy time by 40%.",
      evidence_ids: [sourceId],
    },
    skills: [
      { label: "Core", items: ["Kubernetes"], evidence_ids: [sourceId] },
    ],
    experience: [{ position_id: positionId, context: null, bullets }],
    projects: [],
  });

  type Script = { drafts: ResumeDraft[]; ratings: number[] };

  async function generate(reviewDepth: "quick" | "thorough", script: Script) {
    const { generationId } = await documents.generateResume({
      userId: user.id,
      openingId: opening.id,
      language: "en-US",
      reviewDepth,
      writingLevel: "standard",
      tone: "direct",
    });
    return { generationId, ...(await runScripted(generationId, script)) };
  }

  /** Runs a generation's task with scripted drafts and ratings. */
  async function runScripted(generationId: string, script: Script) {
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
    return { fake };
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
    runScripted,
    keepInstructions,
  };
}

/** Narrows a version's content to the resume these tests generate. */
const resumeOf = (content: DocumentContent): ResumeContent => {
  if (content.kind !== "resume") throw new Error("not a resume");
  return content;
};

const experienceOf = (content: DocumentContent) => {
  const section = resumeOf(content).sections.find(
    (s) => s.kind === "experience"
  );
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

  it("generates with locked facts, a source trace and an ATS check, keeping the best round", async () => {
    const ctx = await setup();
    const [kubernetes, team] = await ctx.keepInstructions([
      "Cut deploy time by 40% with Kubernetes at Initrode",
      "Led a team of 5 engineers",
    ]);
    const { generationId } = await ctx.generate("quick", {
      drafts: [
        ctx.draft(
          [
            {
              text: "Cut deploy time by 40% with Kubernetes.",
              evidence_ids: [kubernetes.id],
            },
          ],
          kubernetes.id
        ),
        ctx.draft(
          [
            {
              text: "Cut deploy time by 40% with Kubernetes.",
              evidence_ids: [kubernetes.id],
            },
            { text: "Led a team of 5 engineers.", evidence_ids: [team.id] },
            { text: "Saved $2M a year.", evidence_ids: [team.id] },
          ],
          kubernetes.id
        ),
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
    expect(resumeOf(version.content).sections.map((s) => s.kind)).toEqual([
      "summary",
      "skills",
      "experience",
      "languages",
    ]);
    expect(version.pages).toBeLessThanOrEqual(2);

    // Every line traces to the user's own words.
    expect(
      entry.lines.every((line) => line.origin.kind === "instruction")
    ).toBe(true);
    expect(version.instructionTrace).toContainEqual({
      instructionId: team.id,
      text: "Led a team of 5 engineers",
    });
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

    const tampered = structuredClone(resumeOf(version.content));
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
    const [team] = await ctx.keepInstructions([
      "Led a team of 5 engineers at Initrode",
    ]);
    await ctx.generate("quick", {
      drafts: [
        ctx.draft([
          {
            text: "Led a team of 5 engineers at Initrode.",
            evidence_ids: [team.id],
          },
        ]),
        ctx.draft([
          {
            text: "Led a team of 5 engineers at Initrode.",
            evidence_ids: [team.id],
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
  });

  it("keeps snapshots as a stack: edits, undo, restore, duplicate", async () => {
    const ctx = await setup();
    const [kubernetes, team] = await ctx.keepInstructions([
      "Cut deploy time by 40% with Kubernetes at Initrode",
      "Led a team of 5 engineers",
    ]);
    const line = {
      text: "Led a team of 5 engineers.",
      evidence_ids: [team.id],
    };
    await ctx.generate("quick", {
      drafts: [
        ctx.draft([line], kubernetes.id),
        ctx.draft([line], kubernetes.id),
      ],
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
    const edited = structuredClone(resumeOf(version.content));
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
    expect(resumeOf(current.content).sections[0]).toMatchObject({
      line: { origin: { kind: "instruction" } },
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
    const tampered = structuredClone(resumeOf(current.content));
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
    await new CareerService(ctx.db).getOrCreateProfile({
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

  it("splits instructions into points that stay in the application, overrides apply", async () => {
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
    // Profile_truth replaces this in P8 (docs/plan.md): no point is promoted
    // to the career; every draft stays in this application.
    await instructions.confirm({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      confirmedLockedFactOverrideIds: review.overrides.map((row) => row.id),
    });
    await instructions.removePoint({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      instructionPointId: emphasis.id,
    });
    // Nothing reached the career's sensitive items.
    expect(await ctx.db.select().from(sensitiveItemsTable)).toEqual([]);

    const after = await instructions.get({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    expect(after.points.map((row) => row.status)).toEqual([
      "kept",
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
            evidence_ids: [migration.id],
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
      ["Led the Kubernetes migration in 2021.", "instruction"],
    ]);
    expect(version.instructionTrace).toEqual([
      { instructionId: gap.id, text: "I built a CLI in Go at Globex" },
      {
        instructionId: migration.id,
        text: "I led the Kubernetes migration in 2021 at Initrode",
      },
    ]);

    // Removing the point that asked for an override removes the override.
    await instructions.removePoint({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      instructionPointId: titleChange.id,
    });
    expect(
      await instructions.get({ userId: ctx.user.id, openingId: ctx.opening.id })
    ).toMatchObject({ overrides: [] });
  });

  it("adapts into another language, approves a title and syncs changes", async () => {
    const ctx = await setup();
    const [kubernetes, team] = await ctx.keepInstructions([
      "Cut deploy time by 40% with Kubernetes at Initrode",
      "Led a team of 5 engineers",
    ]);
    const line = (text: string, id: string) => ({ text, evidence_ids: [id] });
    await ctx.generate("quick", {
      drafts: [
        ctx.draft(
          [
            line("Cut deploy time by 40% with Kubernetes.", kubernetes.id),
            line("Led a team of 5 engineers.", team.id),
          ],
          kubernetes.id
        ),
        ctx.draft([line("Led a team of 5 engineers.", team.id)], kubernetes.id),
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
        ...resumeOf(english.content),
        sections: resumeOf(english.content).sections.map((section) =>
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

  it("renders PDFs once per snapshot, serves them and the ZIP, and drops them on undo", async () => {
    const ctx = await setup();
    const line = {
      text: "Led a team of 5 engineers.",
      evidence_ids: [ctx.evidence[1].id],
    };
    await ctx.generate("quick", {
      drafts: [ctx.draft([line]), ctx.draft([line])],
      ratings: [8, 5],
    });
    const rootDir = await mkdtemp(path.join(tmpdir(), "pdfs-"));
    const storage = createLocalStorage({ rootDir });
    const tasks = new TasksService(ctx.db, ctx.trigger);
    const pdfs = new PdfService(ctx.db, tasks, storage);
    const documents = new DocumentsService(ctx.db, tasks, storage);
    const view = async () =>
      (
        await documents.forOpening({
          userId: ctx.user.id,
          openingId: ctx.opening.id,
        })
      ).documents[0].versions[0];
    const version = await view();
    expect(version.pdf).toEqual({
      ready: false,
      rendering: false,
      fileName: "Platform_Engineer_Resume.pdf",
    });

    expect(
      await pdfs.request({ userId: ctx.user.id, versionId: version.id })
    ).toEqual({ ready: false });
    expect(ctx.trigger.trigger).toHaveBeenLastCalledWith(
      "render_pdf",
      expect.anything()
    );
    expect((await view()).pdf.rendering).toBe(true);
    // Asking again while it renders starts nothing new.
    const calls = ctx.trigger.trigger.mock.calls.length;
    await pdfs.request({ userId: ctx.user.id, versionId: version.id });
    expect(ctx.trigger.trigger.mock.calls.length).toBe(calls);

    await runRenderPdf({
      db: ctx.db,
      cipher: ctx.cipher,
      storage,
      userId: ctx.user.id,
      snapshotId: version.snapshot.id,
    });
    const rendered = await view();
    expect(rendered.pdf.ready).toBe(true);
    expect(rendered.pages).toBe(1);
    const file = await pdfs.read({
      userId: ctx.user.id,
      versionId: version.id,
    });
    expect(file?.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    // Stored encrypted: the driver never sees the PDF.
    const [stored] = await readdir(
      path.join(rootDir, "users", ctx.user.id, "pdfs")
    );
    expect(
      (await readFile(path.join(rootDir, "users", ctx.user.id, "pdfs", stored)))
        .subarray(0, 5)
        .toString()
    ).not.toBe("%PDF-");

    const zip = await pdfs.readApplicationZip({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    expect(zip?.fileName).toBe("Hooli_Platform_Engineer.zip");
    expect(Object.keys(unzipSync(new Uint8Array(zip!.bytes)))).toEqual([
      "Platform_Engineer_Resume.pdf",
    ]);

    // A new snapshot needs its own PDF; undoing it deletes that file.
    await documents.saveEdit({
      userId: ctx.user.id,
      versionId: version.id,
      baseSnapshotId: version.snapshot.id,
      content: {
        ...version.content,
        header: { ...version.content.header, titleLine: "Platform Engineer" },
      },
    });
    const edited = await view();
    expect(edited.pdf.ready).toBe(false);
    await runRenderPdf({
      db: ctx.db,
      cipher: ctx.cipher,
      storage,
      userId: ctx.user.id,
      snapshotId: edited.snapshot.id,
    });
    expect(
      await readdir(path.join(rootDir, "users", ctx.user.id, "pdfs"))
    ).toHaveLength(2);
    await documents.undo({ userId: ctx.user.id, versionId: version.id });
    expect(
      await readdir(path.join(rootDir, "users", ctx.user.id, "pdfs"))
    ).toEqual([stored]);
    expect((await view()).pdf.ready).toBe(true);
    await rm(rootDir, { recursive: true, force: true });
  });

  it("keeps library documents by focus and suggests similar ones to reuse", async () => {
    const ctx = await setup();
    const line = {
      text: "Led a team of 5 engineers.",
      evidence_ids: [ctx.evidence[1].id],
    };
    const library = new LibraryService(
      ctx.db,
      new TasksService(ctx.db, ctx.trigger)
    );
    const created = await library.generateResume({
      userId: ctx.user.id,
      focus: "Platform",
      language: "en-US",
      reviewDepth: "quick",
      writingLevel: "standard",
      tone: "direct",
    });
    const { fake: libraryFake } = await ctx.runScripted(created.generationId, {
      drafts: [ctx.draft([line]), ctx.draft([line])],
      ratings: [8, 5],
    });
    // No opening behind it: the focus stands in for one.
    expect(libraryFake.generateObject.mock.calls[0][0].system).toContain(
      "Its focus: Platform"
    );
    expect(await library.list({ userId: ctx.user.id })).toMatchObject([
      { id: created.documentId, focus: "Platform", languages: ["en-US"] },
    ]);
    const view = await ctx.documents.libraryDocument({
      userId: ctx.user.id,
      documentId: created.documentId,
    });
    const [libraryVersion] = view.versions;
    expect(libraryVersion.atsCheck).toBeNull();
    expect(libraryVersion.pdf.fileName).toBe("Platform_Resume.pdf");
    // Not an application: the opening still has none.
    expect(
      (
        await ctx.documents.forOpening({
          userId: ctx.user.id,
          openingId: ctx.opening.id,
        })
      ).application
    ).toBeNull();

    // Vectors from the local model (faked): the opening finds the document.
    const vector = (seed: number) =>
      Array.from(
        { length: 384 },
        (_, index) => ((index + seed) % 7) / 7 + 0.01
      );
    await embedStaleVersions({
      db: ctx.db,
      cipher: ctx.cipher,
      embedder: { embed: async (texts) => texts.map(() => vector(1)) },
      userId: ctx.user.id,
    });
    expect(
      await library.similarForOpening({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
      })
    ).toEqual([]);
    await ctx.openings.updateOpening(ctx.opening.id, { embedding: vector(1) });
    const [similar] = await library.similarForOpening({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    expect(similar).toMatchObject({
      versionId: libraryVersion.id,
      source: { kind: "library", focus: "Platform" },
    });

    // Use as is: a copy starts the application.
    await library.copyIntoApplication({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      versionId: similar.versionId,
      language: "en-US",
    });
    const opening = await ctx.documents.forOpening({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    expect(opening.application).not.toBeNull();
    expect(opening.documents[0].versions[0]).toMatchObject({
      snapshot: { origin: "copied", author: "user" },
      content: { sections: resumeOf(libraryVersion.content).sections },
    });

    // In another language than the output language, it is adapted instead.
    const adapting = await library.copyIntoApplication({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      versionId: similar.versionId,
      language: "pt-BR",
    });
    expect(adapting).toMatchObject({ versionId: null });
    expect(ctx.trigger.trigger).toHaveBeenLastCalledWith(
      "adapt_document",
      expect.anything()
    );

    // Use as reference: the document guides the next draft.
    const { generationId } = await ctx.documents.generateResume({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      language: "en-US",
      reviewDepth: "quick",
      writingLevel: "standard",
      tone: "direct",
      referenceVersionId: similar.versionId,
    });
    const { fake } = await ctx.runScripted(generationId, {
      drafts: [ctx.draft([line]), ctx.draft([line])],
      ratings: [8, 5],
    });
    expect(fake.generateObject.mock.calls[0][0].system).toContain(
      "A resume the user made for a similar target"
    );
  });

  it("writes a cover letter from approved sources and keeps it in step with its resume", async () => {
    const ctx = await setup();
    const [team] = await ctx.keepInstructions(["Led a team of 5 engineers"]);
    await ctx.generate("quick", {
      drafts: [
        ctx.draft([
          { text: "Led a team of 5 engineers.", evidence_ids: [team.id] },
        ]),
        ctx.draft([
          { text: "Led a team of 5 engineers.", evidence_ids: [team.id] },
        ]),
      ],
      ratings: [8, 5],
    });
    const view = () =>
      ctx.documents.forOpening({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
      });
    const [resumeVersion] = (await view()).documents[0].versions;

    // The letter's inputs: an approved company fact and the interview.
    // Profile_truth replaces this in P8 (docs/plan.md): no story exists, so
    // the story paragraph rests on what the user said in the interview.
    const research = await new ResearchRepository(ctx.db).insertResearch({
      profileId: ctx.profile.id,
      openingId: ctx.opening.id,
      status: "done",
    });
    await new ResearchRepository(ctx.db).insertFacts([
      {
        profileId: ctx.profile.id,
        openingId: ctx.opening.id,
        researchId: research.id,
        encryptedText: ctx.cipher.encrypt(
          "Hooli opened a Lisbon office in 2026."
        ),
        encryptedSourceUrl: ctx.cipher.encrypt("https://hooli.example/lisbon"),
        encryptedSourceTitle: ctx.cipher.encrypt("Hooli in Lisbon"),
        approvedAt: new Date(),
      },
    ]);
    const [fact] = await new ResearchRepository(ctx.db).listFacts(
      ctx.opening.id
    );
    const motivation = new MotivationRepository(ctx.db);
    const interview = await motivation.replaceInterview({
      profileId: ctx.profile.id,
      openingId: ctx.opening.id,
      storyId: null,
      status: "finished",
    });
    await motivation.insertPoints([
      {
        profileId: ctx.profile.id,
        interviewId: interview.id,
        kind: "company",
        encryptedText: ctx.cipher.encrypt("I use Hooli every day"),
        status: "kept",
      },
      {
        profileId: ctx.profile.id,
        interviewId: interview.id,
        kind: "story_detail",
        encryptedText: ctx.cipher.encrypt(
          "At Globex deploys took hours, so I moved our services to Kubernetes"
        ),
        status: "kept",
      },
    ]);
    const points = await motivation.listPoints(interview.id);
    const point = points.find((row) => row.kind === "company")!;
    const detail = points.find((row) => row.kind === "story_detail")!;

    const letters = new LetterService(
      ctx.db,
      new TasksService(ctx.db, ctx.trigger)
    );
    const runLetter = async (generationId: string, drafts: LetterDraft[]) => {
      const queue = [...drafts];
      const filter = await loadSensitiveFilter({
        db: ctx.db,
        cipher: ctx.cipher,
        profileId: ctx.profile.id,
      });
      const fake = fakeProviderPackage({ object: () => queue.shift() });
      const generation = await new DocumentsRepository(ctx.db).findGeneration(
        generationId
      );
      const run =
        generation?.kind === "letter_update"
          ? runUpdateLetter
          : runGenerateLetter;
      await run({
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
    const cite = (
      text: string,
      ids: Partial<
        Record<
          | "evidence_ids"
          | "company_fact_ids"
          | "motivation_point_ids"
          | "career_goal_ids",
          string[]
        >
      >
    ) => ({
      text,
      evidence_ids: [],
      company_fact_ids: [],
      motivation_point_ids: [],
      career_goal_ids: [],
      ...ids,
    });
    const opening = cite(
      "When Hooli opened its Lisbon office in 2026, I wanted in.",
      {
        company_fact_ids: [fact.id],
      }
    );
    const storyParagraph = cite(
      "At Globex, deploys took hours, so I moved our services to Kubernetes.",
      {
        motivation_point_ids: [detail.id],
      }
    );
    const closing = cite("I use Hooli every day and would love to talk.", {
      motivation_point_ids: [point.id],
    });

    const { generationId } = await letters.generate({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      language: "en-US",
      tone: "warm",
      writingLevel: "standard",
      resumeVersionId: resumeVersion.id,
    });
    const fake = await runLetter(generationId, [
      // A claim with no source: refused, then fixed on the second round.
      {
        greeting: "Dear Hooli team,",
        paragraphs: [
          opening,
          cite("I am the best engineer alive.", {}),
          storyParagraph,
        ],
        closing: "Sincerely,",
      },
      {
        greeting: "Dear Hooli team,",
        paragraphs: [opening, storyParagraph, closing],
        closing: "Sincerely,",
      },
    ]);
    expect(fake.generateObject).toHaveBeenCalledTimes(2);
    const prompt = fake.generateObject.mock.calls[0][0];
    expect(prompt.system).toContain("one convincing story");
    expect(JSON.stringify(prompt)).toContain("deploys took hours");

    const letterDocument = () =>
      view().then(
        (data) => data.documents.find((d) => d.kind === "cover_letter")!
      );
    let [letter] = (await letterDocument()).versions;
    expect(letter.content).toMatchObject({
      kind: "cover_letter",
      greeting: "Dear Hooli team,",
      paragraphs: [
        {
          text: opening.text,
          origin: { kind: "letter", companyFactIds: [fact.id] },
        },
        {
          text: storyParagraph.text,
          origin: { kind: "letter", motivationPointIds: [detail.id] },
        },
        {
          text: closing.text,
          origin: { kind: "letter", motivationPointIds: [point.id] },
        },
      ],
    });
    expect(letter.letter).toEqual({
      resumeVersionId: resumeVersion.id,
      outdated: false,
      motivationSkipped: false,
    });
    expect(letter.letterTrace?.companyFacts).toEqual([
      {
        id: fact.id,
        text: "Hooli opened a Lisbon office in 2026.",
        sourceUrl: "https://hooli.example/lisbon",
      },
    ]);
    expect(letter.pages).toBeLessThanOrEqual(1);

    // The resume changes: the letter is outdated relative to it.
    const editResume = async (title: string) => {
      const [current] = (await view()).documents[0].versions;
      await ctx.documents.saveEdit({
        userId: ctx.user.id,
        versionId: current.id,
        baseSnapshotId: current.snapshot.id,
        content: {
          ...resumeOf(current.content),
          header: { ...current.content.header, titleLine: title },
        },
      });
    };
    await editResume("Staff Platform Engineer");
    [letter] = (await letterDocument()).versions;
    expect(letter.letter?.outdated).toBe(true);

    // Update the cover letter: a proposal that keeps untouched paragraphs.
    const updated = await letters.update({
      userId: ctx.user.id,
      versionId: letter.id,
    });
    await runLetter(updated.generationId, [
      {
        greeting: "Dear Hooli team,",
        paragraphs: [
          opening,
          cite(
            "At Globex, as a staff-level engineer, I moved our services to Kubernetes.",
            { motivation_point_ids: [detail.id] }
          ),
          closing,
        ],
        closing: "Sincerely,",
      },
    ]);
    const { proposal } = await letterDocument();
    expect(
      proposal?.lines.map((line) => ({
        before: line.before,
        after: line.after,
      }))
    ).toEqual([
      {
        before: null,
        after:
          "At Globex, as a staff-level engineer, I moved our services to Kubernetes.",
      },
      { before: storyParagraph.text, after: null },
    ]);
    await new AdaptationService(
      ctx.db,
      new TasksService(ctx.db, ctx.trigger)
    ).acceptSync({
      userId: ctx.user.id,
      generationId: updated.generationId,
    });
    [letter] = (await letterDocument()).versions;
    expect(letter.letter?.outdated).toBe(false);
    const content = letter.content as CoverLetterContent;
    expect(content.paragraphs[0].origin).toMatchObject({
      companyFactIds: [fact.id],
    });

    // Kept as it is: no notice until the resume changes again.
    await editResume("Principal Platform Engineer");
    expect((await letterDocument()).versions[0].letter?.outdated).toBe(true);
    await letters.dismissOutdated({
      userId: ctx.user.id,
      versionId: letter.id,
    });
    expect((await letterDocument()).versions[0].letter?.outdated).toBe(false);

    // A copy keeps the resume its text came from.
    const { versionId: copyId } = await ctx.documents.duplicate({
      userId: ctx.user.id,
      versionId: letter.id,
    });
    const copy = (await letterDocument()).versions.find((v) => v.id === copyId);
    expect(copy?.letter?.resumeVersionId).toBe(resumeVersion.id);

    // The user's edit makes a paragraph their own words.
    letter = (await letterDocument()).versions.find((v) => v.id === letter.id)!;
    const edited = letter.content as CoverLetterContent;
    await ctx.documents.saveEdit({
      userId: ctx.user.id,
      versionId: letter.id,
      baseSnapshotId: letter.snapshot.id,
      content: {
        ...edited,
        paragraphs: edited.paragraphs.map((line, index) =>
          index === 2 ? { ...line, text: "Let's talk soon." } : line
        ),
      },
    });
    const after = (await letterDocument()).versions.find(
      (v) => v.id === letter.id
    )!;
    expect((after.content as CoverLetterContent).paragraphs[2]).toMatchObject({
      text: "Let's talk soon.",
      origin: { kind: "manual" },
    });
  });
});
