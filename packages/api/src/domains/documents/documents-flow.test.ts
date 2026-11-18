import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { unzipSync } from "fflate";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAiClient } from "@repo/api/domains/ai/ai-client";
import { CareerService } from "@repo/api/domains/career/career-service";
import { creditCap } from "@repo/api/domains/credits/credit-pricing";
import { creditReserve } from "@repo/api/domains/credits/credit-reserve";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadNeverIncludeFilter } from "@repo/api/domains/profile/rules/load-never-include-filter";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import { ProfileService } from "@repo/api/domains/profile/profile-service";
import type * as SuggestLineModule from "@repo/api/domains/profile/suggestions/suggest-line";
import { suggestLine } from "@repo/api/domains/profile/suggestions/suggest-line";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";
import { lockedFactOverridesTable } from "@repo/api/domains/applications/db/instructions-tables";
import { InstructionsRepository } from "@repo/api/domains/applications/instructions-repository";
import { InstructionsService } from "@repo/api/domains/applications/instructions-service";
import { MotivationRepository } from "@repo/api/domains/applications/motivation/motivation-repository";
import { ResearchRepository } from "@repo/api/domains/applications/research/research-repository";
import { runSplitInstructions } from "@repo/api/domains/applications/run-split-instructions";
import { createLocalStorage } from "@repo/api/tools/storage/local-storage";
import { TrackerService } from "@repo/api/domains/applications/tracker/tracker-service";
import { ProfileRepository } from "@repo/api/domains/profile/profile-repository";
import { readSuggestionContent } from "@repo/api/domains/profile/suggestions/propose-suggestion";

import { loadProfileSource } from "./generation/load-profile-source";
import { AdaptationService } from "./adaptation/adaptation-service";
import type { CoverageReviewDraft } from "./coverage-review/coverage-review";
import { LibraryService } from "./library/library-service";
import { embedStaleVersions } from "./similar/embed-versions";
import { runAdaptDocument } from "./adaptation/run-adapt-document";
import type { LetterDraft } from "./letter/assemble-letter";
import { LetterService } from "./letter/letter-service";
import { runGenerateLetter } from "./letter/run-generate-letter";
import { runUpdateLetter } from "./letter/run-update-letter";
import type { CoverLetterContent } from "./schemas/cover-letter-content";
import { generationsTable } from "./db/documents-tables";
import { DocumentsRepository } from "./documents-repository";
import { DocumentsService } from "./documents-service";
import type { AdjustDraft } from "./generation/adjust-resume";
import type { ResumeDraft } from "./generation/assemble-resume";
import { loadCareerContext } from "./generation/load-career-context";
import {
  coverageRating,
  runGenerateResume,
} from "./generation/run-generate-resume";
import { PdfService } from "./rendering/pdf-service";
import { runRenderPdf } from "./rendering/run-render-pdf";
import type { DocumentContent } from "./schemas/document-content";
import { defaultGenerationSettings } from "./schemas/generation-settings";
import type { ResumeContent } from "./schemas/resume-content";
import { WritingService } from "./writing/writing-service";

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

/**
 * The profile these tests publish: the only source of a document's facts
 * (ADR 0008). `extra` adds what one test needs to the sections it names.
 */
const profileMarkdown = (
  extra: {
    results?: string[];
    experience?: string;
    certifications?: string[];
    competencies?: string[];
    languages?: string[];
    rules?: string[];
    direction?: string;
  } = {}
) => `# Profile

## Professional identity

- Professional name: Ada Lovelace
- Platform engineer and tech lead.
${extra.direction ? `- Career direction (what I look for): ${extra.direction}\n` : ""}
## Contact (only what may appear on a resume)

- Professional email: ada@example.com
- City and state: Belo Horizonte, MG

## Experience (most recent first)

### Globex — Tech Lead (2021-03 to present)

- Responsibilities: Led a team of 5 engineers.
- Tools: Kubernetes, Terraform
- Results:
  - Cut deploy time by 40% with Kubernetes [measured: CI dashboard].
  - Cut cloud costs by 30% [estimated].
${(extra.results ?? []).map((line) => `  - ${line}\n`).join("")}
${extra.experience ?? ""}
## Education

## Certifications

${(extra.certifications ?? []).map((line) => `- ${line}\n`).join("")}
## Competencies

- I master: Kubernetes, Terraform
${(extra.competencies ?? []).map((line) => `- ${line}\n`).join("")}
## Languages

- English — C1
${(extra.languages ?? []).map((line) => `- ${line}\n`).join("")}
## Known gaps

- Go in production.

## Communication rules

${(extra.rules ?? []).map((line) => `- ${line}\n`).join("")}`;

/**
 * A review whose coverage rates the draft `rating` out of 10: that many
 * requirements shown strongly, the rest not proven.
 */
const reviewRated = (rating: number) => ({
  coverage: Array.from({ length: 10 }, (_, index) => ({
    requirement: `Requirement ${index + 1}`,
    level: index < rating ? ("strong" as const) : ("not_proven" as const),
  })),
  inconsistencies: [],
  advice: ["Be more concrete"],
});

/** What the coverage reviewer answers unless a test scripts it. */
const emptyCoverage: CoverageReviewDraft = {
  strong: [],
  partial: [],
  gaps: [],
  inconsistencies: [],
  suggestions: [],
};

/** The resume lines as the reviewer's prompt lists them: text → line id. */
const reviewedLineIds = (system: string) =>
  new Map(
    [...system.matchAll(/\[([^\]\s]+)\] (.+)/g)].map((match) => [
      match[2].trim(),
      match[1],
    ])
  );

async function setup({
  markdown = profileMarkdown(),
}: {
  // Null publishes nothing.
  markdown?: string | null;
} = {}) {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const career = new CareerService(db);
  const profile = await career.getOrCreateProfile({
    userId: user.id,
    defaultLanguage: "en-US",
  });
  const cipher = await getUserCipher(db, user.id);
  const trigger = {
    trigger: vi.fn(async () => ({ runId: "run", accessToken: "t" })),
  };
  const tasks = new TasksService(db, trigger);
  const profiles = new ProfileService(db, tasks);

  /** Saves and publishes the profile: a new version from then on. */
  async function publishProfile(text: string) {
    const current = await profiles.getDraft({
      userId: user.id,
      language: "en-US",
    });
    const { revision } = await profiles.saveDraft({
      userId: user.id,
      markdown: text,
      baseRevision: current.revision,
    });
    await profiles.publish({ userId: user.id, baseRevision: revision });
  }
  if (markdown !== null) await publishProfile(markdown);

  /** The career as generation reads it from the version published now. */
  const readCareer = async () =>
    loadCareerContext({
      db,
      cipher,
      profileId: profile.id,
      filter: await loadNeverIncludeFilter({
        db,
        cipher,
        profileId: profile.id,
      }),
    });
  const context = await readCareer();
  // Ids are derived from the profile: nothing here is a table row's.
  const positionId = context.positions[0]?.id;
  /** The profile line holding this text, as a draft cites it. */
  const lineOf = (text: string, from = context) =>
    from.evidence.find((row) => row.text.includes(text))!;
  /** The fit check passage a profile line is in. */
  const passageOf = (evidenceId: string, from = context) =>
    [...from.evidenceOfPassage].find(([, ids]) => ids.includes(evidenceId))![0];
  // The measured result and the team: the lines most drafts cite.
  const evidence =
    markdown === null
      ? []
      : [lineOf("Cut deploy time by 40%"), lineOf("Led a team of 5 engineers")];

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
  // A fit check cites the profile's passages.
  const met = evidence.length ? [passageOf(evidence[0].id)] : [];
  await openings.insertFitCheck({
    openingId: opening.id,
    band: "medium",
    items: [
      {
        termId: term("Kubernetes"),
        verdict: "met",
        evidenceIds: met,
        encryptedExplanation: cipher.encrypt("Runs Kubernetes"),
      },
      {
        termId: term("K8s operators"),
        verdict: "met",
        evidenceIds: met,
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
   * Points the user kept for this application: their own statements, which
   * a resume line can rest on like a line of the profile.
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

  const documents = new DocumentsService(db, tasks);

  // `sourceId` backs the summary and skills: a kept point's id, or by
  // default the profile's measured result.
  const draft = (
    bullets: ResumeDraft["experience"][number]["bullets"],
    sourceId = evidence[0].id,
    emphasis = ["Kubernetes and deploys first"]
  ): ResumeDraft => ({
    emphasis,
    title_line: "Platform Engineer | Kubernetes",
    summary: {
      text: "Engineer who cut deploy time by 40%.",
      evidence_ids: [sourceId],
    },
    skills: [
      { label: "Core", items: ["Kubernetes"], evidence_ids: [sourceId] },
    ],
    experience: [
      { position_id: positionId, context: null, relevance: null, bullets },
    ],
    projects: [],
  });

  // `ratings`: what each review's coverage rates its draft, in order.
  type Script = {
    drafts: Array<ResumeDraft | AdjustDraft>;
    ratings: number[];
    /** This month (YYYY-MM), for what "recent" is measured from. */
    today?: string;
    /** The coverage review, given the resume's lines by text. */
    coverage?: (lines: Map<string, string>) => CoverageReviewDraft;
    /** The coverage review call fails (a provider error). */
    coverageFails?: boolean;
  };
  const request = {
    userId: user.id,
    openingId: opening.id,
    language: "en-US" as const,
    reviewDepth: "quick" as const,
    writingLevel: "standard" as const,
    tone: "direct" as const,
  };

  async function generate(reviewDepth: "quick" | "thorough", script: Script) {
    const { generationId } = await documents.generateResume({
      ...request,
      reviewDepth,
    });
    return { generationId, ...(await runScripted(generationId, script)) };
  }

  /** Runs a generation's task with scripted drafts and reviews. */
  async function runScripted(generationId: string, script: Script) {
    const drafts = [...script.drafts];
    const ratings = [...script.ratings];
    const filter = await loadNeverIncludeFilter({
      db,
      cipher,
      profileId: profile.id,
    });
    const fake = fakeProviderPackage({
      object: ({ system }) => {
        if (system.startsWith("You review")) {
          return reviewRated(ratings.shift() ?? 5);
        }
        if (system.startsWith("You audit")) {
          if (script.coverageFails) throw new Error("provider down");
          return script.coverage?.(reviewedLineIds(system)) ?? emptyCoverage;
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
        neverIncludeFilter: filter,
      }),
      cipher,
      userId: user.id,
      generationId,
      today: script.today,
    });
    return { fake };
  }

  return {
    db,
    user,
    profile,
    context,
    positionId,
    evidence,
    lineOf,
    passageOf,
    readCareer,
    publishProfile,
    opening,
    openings,
    cipher,
    trigger,
    documents,
    request,
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
    const [deploy] = ctx.evidence;
    const [team] = await ctx.keepInstructions(["Led a team of 5 engineers"]);
    const { generationId } = await ctx.generate("quick", {
      drafts: [
        ctx.draft(
          [
            {
              text: "Cut deploy time by 40% with Kubernetes.",
              evidence_ids: [deploy.id],
            },
          ],
          deploy.id,
          ["The first draft's emphasis"]
        ),
        ctx.draft(
          [
            {
              text: "Cut deploy time by 40% with Kubernetes.",
              evidence_ids: [deploy.id],
            },
            { text: "Led a team of 5 engineers.", evidence_ids: [team.id] },
            { text: "Saved $2M a year.", evidence_ids: [team.id] },
          ],
          deploy.id,
          ["One", "Two", " Three ", "", "Four", "Five", "Six"]
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
    // The header comes from the profile's identity and contact.
    expect(resumeOf(version.content).header).toEqual({
      name: "Ada Lovelace",
      titleLine: "Platform Engineer | Kubernetes",
      contacts: ["ada@example.com"],
      city: "Belo Horizonte, MG",
    });
    // What the kept draft emphasizes, in at most five lines.
    expect(version.emphasis).toEqual({
      lines: ["One", "Two", "Three", "Four", "Five"],
      adjusted: false,
    });

    // Every line traces to the profile or to the user's own words.
    expect(entry.lines.map((line) => line.origin)).toEqual([
      { kind: "evidence", evidenceIds: [deploy.id] },
      { kind: "instruction", instructionIds: [team.id], evidenceIds: [] },
    ]);
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
    // Strategist, one editor, two reviews, the coverage review.
    expect(fake.generateObject).toHaveBeenCalledTimes(5);
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
    // Strategist, one review and the coverage review; no editor round was
    // paid for.
    expect(fake.generateObject).toHaveBeenCalledTimes(3);
  });

  it("prints the profile's facts, leaves out what it must not use and locks credentials", async () => {
    const ctx = await setup({
      markdown: profileMarkdown({
        results: ["Moved the billing platform of Initrode [no number]."],
        competencies: ["Studied, without professional experience: Rust"],
        rules: ["Never include: Initrode"],
      }),
    });
    // The line naming what must never be included isn't handed to a writer.
    expect(JSON.stringify(ctx.context.evidence)).not.toContain("Initrode");
    const results = ctx.context.evidenceOfPassage.get(
      ctx.passageOf(ctx.evidence[0].id)
    )!;
    expect(results).toHaveLength(3);
    const line = {
      text: "Led a team of 5 engineers.",
      evidence_ids: [ctx.evidence[1].id],
    };
    const written: ResumeDraft = {
      ...ctx.draft([
        line,
        // Citing the line left out backs nothing.
        { text: "Moved a billing platform.", evidence_ids: [results[2]] },
      ]),
      skills: [
        {
          label: "Core",
          // A competency only studied is never a skill.
          items: ["Kubernetes", "Rust"],
          evidence_ids: [ctx.evidence[0].id],
        },
      ],
    };
    await ctx.generate("quick", {
      drafts: [written, written],
      ratings: [7, 6],
    });
    const [version] = (
      await ctx.documents.forOpening({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
      })
    ).documents[0].versions;
    expect(experienceOf(version.content)).toMatchObject({
      employer: "Globex",
      lines: [{ text: "Led a team of 5 engineers." }],
    });
    expect(JSON.stringify(version.content)).not.toMatch(
      /Initrode|Rust|billing|Go in production/
    );
    const languages = resumeOf(version.content).sections.find(
      (s) => s.kind === "languages"
    );
    expect(languages).toMatchObject({
      entries: [{ title: "English", level: "C1" }],
    });

    const tampered = structuredClone(resumeOf(version.content));
    const tamperedLanguages = tampered.sections.find(
      (s) => s.kind === "languages"
    );
    if (tamperedLanguages?.kind === "languages") {
      tamperedLanguages.entries[0].level = "Native";
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
    const ctx = await setup({
      markdown: profileMarkdown({ rules: ["Never include: Initrode"] }),
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
    // Whatever the review says, a draft carrying the name rates 1.
    const rounds = await new DocumentsRepository(ctx.db).listReviewRounds(
      view.documents[0].generation!.id
    );
    expect(rounds.map((round) => round.rating)).toEqual([1, 1]);
  });

  it("keeps a finished resume when its coverage review fails", async () => {
    const ctx = await setup();
    const [deploy] = ctx.evidence;
    const { generationId } = await ctx.generate("quick", {
      drafts: [
        ctx.draft([
          {
            text: "Cut deploy time by 40% with Kubernetes.",
            evidence_ids: [deploy.id],
          },
        ]),
      ],
      ratings: [9],
      coverageFails: true,
    });
    const repository = new DocumentsRepository(ctx.db);
    const generation = await repository.findGeneration(generationId);
    expect(generation).toMatchObject({ status: "completed" });
    // Saved without a review; the code checks still run on it.
    expect(
      await repository.latestCoverageReview(generation.versionId!)
    ).toBeNull();
    const view = await ctx.documents.forOpening({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    expect(view.documents[0].versions[0].coverage).toMatchObject({
      findings: [],
      review: null,
    });
  });

  it("reviews each generated resume's coverage, never covering a gap, and ends with the method's statement", async () => {
    const ctx = await setup();
    const [deploy] = ctx.evidence;
    const [team] = await ctx.keepInstructions(["Led a team of 5 engineers"]);
    const deployText = "Cut deploy time by 40% with Kubernetes.";
    const teamText = "Led a team of 5 engineers.";
    const { generationId } = await ctx.generate("quick", {
      drafts: [
        ctx.draft([
          { text: deployText, evidence_ids: [deploy.id] },
          { text: teamText, evidence_ids: [team.id] },
        ]),
      ],
      ratings: [9],
      coverage: (lines) => ({
        strong: [
          {
            requirement: "Kubernetes",
            line_id: lines.get(deployText)!,
            evidence_id: deploy.id,
          },
          // An instruction is not a profile line: no evidence in the profile.
          {
            requirement: "K8s operators",
            line_id: lines.get(teamText)!,
            evidence_id: team.id,
          },
        ],
        partial: [],
        gaps: [],
        inconsistencies: [
          {
            line_id: lines.get(teamText)!,
            explanation: "The profile says nothing.",
          },
        ],
        suggestions: [
          // Names the gap: never kept, however it is worded.
          {
            kind: "reorder",
            line_id: null,
            text: "Mention Go in the summary.",
          },
          { kind: "reorder", line_id: null, text: "Add a Terraform bullet." },
          {
            kind: "reorder",
            line_id: lines.get(teamText)!,
            text: "Open with the team line.",
          },
          {
            kind: "profile",
            line_id: lines.get(teamText)!,
            text: "The team of 5 is not in the profile's Globex results.",
          },
          // Already in the profile: nothing to send.
          { kind: "profile", line_id: lines.get(deployText)!, text: "Add it." },
        ],
      }),
    });

    const view = await ctx.documents.forOpening({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    const [version] = view.documents[0].versions;
    const [deployLine, teamLine] = experienceOf(version.content).lines;
    const proof = {
      evidenceId: deploy.id,
      text: deploy.text,
      source: { kind: "position", title: "Tech Lead", employer: "Globex" },
    };
    // Every cited profile line, read from the frozen version: the result
    // the bullet and summary cite, and the competency line the skills cite.
    expect(version.trace).toEqual([
      proof,
      {
        evidenceId: ctx.lineOf("I master").id,
        text: "I master: Kubernetes, Terraform",
        source: null,
      },
    ]);
    expect(version.coverage).toMatchObject({
      findings: [],
      reviewedSnapshotId: version.snapshot.id,
      current: true,
    });
    const review = version.coverage!.review!;
    expect(review).toMatchObject({
      sources: {
        profileVersionNumber: 1,
        purpose: {
          kind: "opening",
          title: "Platform Engineer",
          company: "Hooli",
        },
        instructions: 1,
      },
      preserved: [
        {
          positionId: ctx.positionId,
          employer: "Globex",
          title: "Tech Lead",
          startDate: "2021-03",
          endDate: null,
          bullets: 2,
        },
      ],
      strong: [
        {
          requirement: "Kubernetes",
          lineId: deployLine.id,
          lineText: deployText,
          evidence: proof,
        },
      ],
      partial: [
        {
          requirement: "K8s operators",
          explanation: "no evidence in the profile",
        },
      ],
      gaps: ["Go"],
      inconsistencies: [
        {
          lineId: teamLine.id,
          lineText: teamText,
          explanation: "The profile says nothing.",
        },
      ],
      suggestions: [
        {
          kind: "reorder",
          lineId: teamLine.id,
          lineText: teamText,
          text: "Open with the team line.",
        },
        {
          kind: "profile",
          lineId: teamLine.id,
          lineText: teamText,
          text: "The team of 5 is not in the profile's Globex results.",
        },
      ],
      statement:
        "This review does not claim that every mandatory requirement is met.",
    });
    const stored = await new DocumentsRepository(ctx.db).latestCoverageReview(
      version.id
    );
    expect(stored?.review).toMatchObject({
      id: review.id,
      generationId,
      snapshotId: version.snapshot.id,
      profileVersionId: version.snapshot && stored?.snapshot.profileVersionId,
    });

    // "Send to my profile": the user's statement goes to the draft's Globex
    // results as a suggestion, nothing more.
    const { profileSuggestionId } = await ctx.documents.sendToProfile({
      userId: ctx.user.id,
      coverageReviewId: review.id,
      lineId: teamLine.id,
    });
    const profiles = new ProfileRepository(ctx.db);
    const profileDocument = await profiles.findDocument(ctx.user.id, "profile");
    const pending = await profiles.listPendingSuggestions(profileDocument.id);
    expect(
      pending.map((row) => ({
        id: row.id,
        origin: row.origin,
        ...readSuggestionContent(ctx.cipher, row),
      }))
    ).toEqual([
      {
        id: profileSuggestionId,
        origin: "application",
        part: "experience:globex — tech lead",
        find: "  - Cut cloud costs by 30% [estimated].",
        replace:
          "  - Cut cloud costs by 30% [estimated].\n  - Led a team of 5 engineers.",
        reason: "The team of 5 is not in the profile's Globex results.",
      },
    ]);
    // A profile-backed line has no suggestion to send.
    await expect(
      ctx.documents.sendToProfile({
        userId: ctx.user.id,
        coverageReviewId: review.id,
        lineId: deployLine.id,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Another user's review is not theirs to send.
    const other = await createTestUser("grace@example.com");
    await new CareerService(ctx.db).getOrCreateProfile({
      userId: other.id,
      defaultLanguage: "en-US",
    });
    await expect(
      ctx.documents.sendToProfile({
        userId: other.id,
        coverageReviewId: review.id,
        lineId: teamLine.id,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("blocks a resume with a figure the profile doesn't mark measured until it is fixed", async () => {
    const ctx = await setup();
    const line = {
      text: "Led a team of 5 engineers.",
      evidence_ids: [ctx.evidence[1].id],
    };
    await ctx.generate("quick", { drafts: [ctx.draft([line])], ratings: [9] });
    const pdfs = new PdfService(ctx.db, new TasksService(ctx.db, ctx.trigger));
    const tracker = new TrackerService(ctx.db);
    const forOpening = () =>
      ctx.documents.forOpening({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
      });
    const view = async () => (await forOpening()).documents[0].versions[0];
    const applicationId = (await forOpening()).application!.id;
    const clean = await view();
    expect(clean.coverage).toMatchObject({ findings: [], current: true });

    // The user types a result the profile marks only as estimated.
    const entry = experienceOf(clean.content);
    await ctx.documents.saveEdit({
      userId: ctx.user.id,
      versionId: clean.id,
      baseSnapshotId: clean.snapshot.id,
      content: {
        ...resumeOf(clean.content),
        sections: resumeOf(clean.content).sections.map((section) =>
          section.kind === "experience"
            ? {
                ...section,
                entries: [
                  {
                    ...entry,
                    lines: [
                      ...entry.lines,
                      {
                        id: "costs",
                        text: "Cut costs by 30%.",
                        origin: { kind: "manual" as const },
                      },
                    ],
                  },
                ],
              }
            : section
        ),
      },
    });
    const edited = await view();
    expect(edited.coverage).toMatchObject({
      findings: [
        {
          code: "figure",
          lineId: "costs",
          positionId: ctx.positionId,
          text: "Cut costs by 30%.",
          params: { figures: "30%" },
        },
      ],
      // The review is of the generated snapshot, not of the edit.
      reviewedSnapshotId: clean.snapshot.id,
      current: false,
    });
    // Nothing leaves the platform: no download, no ZIP, no sending.
    const blocked = { code: "PRECONDITION_FAILED" };
    const userId = ctx.user.id;
    await expect(
      pdfs.request({ userId, versionId: clean.id })
    ).rejects.toMatchObject(blocked);
    await expect(
      pdfs.prepareApplication({ userId, openingId: ctx.opening.id })
    ).rejects.toMatchObject(blocked);
    await expect(
      pdfs.readApplicationZip({ userId, openingId: ctx.opening.id })
    ).rejects.toMatchObject(blocked);
    await expect(
      tracker.markApplied({ userId, applicationId, versionIds: [clean.id] })
    ).rejects.toMatchObject(blocked);
    expect(ctx.trigger.trigger).not.toHaveBeenCalledWith(
      "render_pdf",
      expect.anything()
    );

    // Taking the figure out unblocks it.
    await ctx.documents.undo({ userId, versionId: clean.id });
    expect((await view()).coverage?.findings).toEqual([]);
    expect(await pdfs.request({ userId, versionId: clean.id })).toEqual({
      ready: false,
    });
    await tracker.markApplied({
      userId,
      applicationId,
      versionIds: [clean.id],
    });
    expect((await forOpening()).application?.status).toBe("applied");
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

  it("promoting an instruction creates a suggestion in the profile's draft, not a change", async () => {
    const ctx = await setup({
      markdown: `${profileMarkdown()}\n## Addenda (details remembered later)\n`,
    });
    const instructions = new InstructionsService(
      ctx.db,
      new TasksService(ctx.db, ctx.trigger)
    );
    const profiles = new ProfileService(
      ctx.db,
      new TasksService(ctx.db, ctx.trigger)
    );
    const draftBefore = (
      await profiles.getDraft({ userId: ctx.user.id, language: "en-US" })
    ).markdown;
    await instructions.split({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      text: "I led the Kubernetes migration in 2021. I speak at meetups. I did a thing at Initrode. Emphasize people management.",
    });
    const submitted = await new InstructionsRepository(
      ctx.db
    ).latestInstructions(ctx.opening.id);
    const point = {
      gap_ref: null,
      looks_like_career_fact: true,
      position_id: null,
      credential_id: null,
      evidence_kind: null,
      locked_fact_change: null,
    };
    const fake = fakeProviderPackage({
      object: () => ({
        points: [
          {
            ...point,
            text: "I led the Kubernetes migration in 2021",
            position_id: ctx.positionId,
            evidence_kind: "achievement",
          },
          { ...point, text: "I speak at meetups" },
          {
            ...point,
            text: "I did a thing at Initrode",
            position_id: ctx.positionId,
            evidence_kind: "tool",
          },
          {
            ...point,
            text: "Emphasize people management",
            looks_like_career_fact: false,
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
      }),
      cipher: ctx.cipher,
      userId: ctx.user.id,
      applicationInstructionsId: submitted.id,
    });
    const review = await instructions.get({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    const [migration, meetups, tool, emphasis] = review.points;

    // “Send to my profile” on three points; the fourth stays here.
    const { sent } = await instructions.confirm({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      confirmedLockedFactOverrideIds: [],
      sentToProfileInstructionPointIds: [migration.id, meetups.id, tool.id],
    });
    expect(sent.map((row) => row.instructionPointId)).toEqual([
      migration.id,
      meetups.id,
      tool.id,
    ]);
    const suggestions = await profiles.listSuggestions(ctx.user.id);
    const lastResult = "  - Cut cloud costs by 30% [estimated].";
    expect(suggestions).toMatchObject([
      // The point's position, under Results, after the last one.
      {
        id: sent[0].profileSuggestionId,
        origin: "application",
        part: "experience:globex — tech lead",
        find: lastResult,
        replace: `${lastResult}\n  - I led the Kubernetes migration in 2021`,
      },
      // No position: Addenda.
      {
        id: sent[1].profileSuggestionId,
        part: "addenda",
        replace: "- I speak at meetups",
      },
      // A tool, under the position's Tools.
      {
        id: sent[2].profileSuggestionId,
        find: "- Tools: Kubernetes, Terraform",
        replace:
          "- Tools: Kubernetes, Terraform\n  - I did a thing at Initrode",
      },
    ]);
    // A suggestion, not a change: the draft is as it was, until accepted.
    expect(
      (await profiles.getDraft({ userId: ctx.user.id, language: "en-US" }))
        .markdown
    ).toBe(draftBefore);

    // Every point stays in the application, the sent ones marked.
    const after = await instructions.get({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    expect(after.points.map((row) => [row.status, row.sentToProfile])).toEqual([
      ["kept", true],
      ["kept", true],
      ["kept", true],
      ["kept", false],
    ]);
    expect(emphasis.sentToProfile).toBe(false);
    // Sent again: nothing new (the points are no longer drafts).
    expect(
      await instructions.confirm({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
        confirmedLockedFactOverrideIds: [],
        sentToProfileInstructionPointIds: [migration.id],
      })
    ).toEqual({ sent: [] });
  });

  it("marks an instruction sent only once its suggestion exists, so a failed send can be retried", async () => {
    const ctx = await setup({
      markdown: `${profileMarkdown()}\n## Addenda (details remembered later)\n`,
    });
    const instructions = new InstructionsService(
      ctx.db,
      new TasksService(ctx.db, ctx.trigger)
    );
    const [drafted] = await new InstructionsRepository(ctx.db).insertPoints([
      {
        profileId: ctx.profile.id,
        openingId: ctx.opening.id,
        source: "written",
        sequence: 1,
        encryptedText: ctx.cipher.encrypt("I speak at meetups"),
        status: "draft",
        positionId: null,
      },
    ]);
    const confirm = () =>
      instructions.confirm({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
        confirmedLockedFactOverrideIds: [],
        sentToProfileInstructionPointIds: [drafted.id],
      });
    vi.mocked(suggestLine).mockRejectedValueOnce(new Error("boom"));
    await expect(confirm()).rejects.toThrow("boom");
    const afterFailure = await instructions.get({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    expect(
      afterFailure.points.map((row) => [row.status, row.sentToProfile])
    ).toEqual([["kept", false]]);
    const { sent } = await confirm();
    expect(sent.map((row) => row.instructionPointId)).toEqual([drafted.id]);
    expect(
      (
        await instructions.get({
          userId: ctx.user.id,
          openingId: ctx.opening.id,
        })
      ).points.map((row) => row.sentToProfile)
    ).toEqual([true]);
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
        neverIncludeFilter: await loadNeverIncludeFilter({
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
      review.points.map((row) => [row.text, row.source, row.suggestedPromotion])
    ).toEqual([
      ["I led the Kubernetes migration in 2021 at Initrode", "written", true],
      ["Emphasize people management", "written", false],
      [
        "In this application my title at Globex is Engineering Manager",
        "written",
        false,
      ],
      // A target that is not one of the user's positions is no suggestion.
      ["I built a CLI in Go at Globex", "gap_answer", false],
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
    // Nothing is sent to the profile here: every draft stays in this
    // application.
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

  it("prints a confirmed locked-fact override in the generated resume", async () => {
    const ctx = await setup();
    const tasks = new TasksService(ctx.db, ctx.trigger);
    const instructions = new InstructionsService(ctx.db, tasks);
    const team = ctx.evidence[1];
    const written =
      "In this application my title at Globex is Engineering Manager. I started there in January 2021.";
    await instructions.split({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      text: written,
    });
    const submitted = await new InstructionsRepository(
      ctx.db
    ).latestInstructions(ctx.opening.id);
    const point = {
      gap_ref: null,
      looks_like_career_fact: false,
      position_id: null,
      credential_id: null,
      evidence_kind: null,
    };
    const fake = fakeProviderPackage({
      object: () => ({
        points: [
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
            text: "I started there in January 2021",
            locked_fact_change: {
              position_id: ctx.positionId,
              field: "start_date",
              value: "2021-01",
            },
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
      }),
      cipher: ctx.cipher,
      userId: ctx.user.id,
      applicationInstructionsId: submitted.id,
    });
    // The split is told the profile's positions, by the ids generation
    // knows them by.
    expect(fake.generateObject.mock.calls[0][0].system).toContain(
      `- ${ctx.positionId}: Tech Lead at Globex, 2021-03 to present`
    );
    const review = await instructions.get({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    expect(review.overrides).toMatchObject([
      {
        positionId: ctx.positionId,
        employer: "Globex",
        field: "title",
        original: "Tech Lead",
        value: "Engineering Manager",
        confirmed: false,
      },
      {
        positionId: ctx.positionId,
        field: "start_date",
        original: "2021-03",
        value: "2021-01",
        confirmed: false,
      },
    ]);
    // Only the title is confirmed: the other stays as the profile has it.
    const [title, start] = review.overrides;
    await instructions.confirm({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      confirmedLockedFactOverrideIds: [title.id],
    });
    expect(
      (
        await instructions.get({
          userId: ctx.user.id,
          openingId: ctx.opening.id,
        })
      ).overrides.map((row) => [row.id, row.confirmed])
    ).toEqual([[title.id, true]]);
    expect(start.confirmed).toBe(false);

    const line = {
      text: "Led a team of 5 engineers.",
      evidence_ids: [team.id],
    };
    await ctx.generate("quick", { drafts: [ctx.draft([line])], ratings: [9] });
    const [version] = (
      await ctx.documents.forOpening({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
      })
    ).documents[0].versions;
    expect(experienceOf(version.content)).toMatchObject({
      positionId: ctx.positionId,
      employer: "Globex",
      title: "Engineering Manager",
      startDate: "2021-03",
      lines: [{ text: "Led a team of 5 engineers." }],
    });

    // It is this application's only: a library document prints the profile.
    const library = await new LibraryService(ctx.db, tasks).generateResume({
      userId: ctx.user.id,
      focus: "Platform",
      language: "en-US",
      reviewDepth: "quick",
      writingLevel: "standard",
      tone: "direct",
    });
    await ctx.runScripted(library.generationId, {
      drafts: [ctx.draft([line])],
      ratings: [9],
    });
    const [libraryVersion] = (
      await ctx.documents.libraryDocument({
        userId: ctx.user.id,
        documentId: library.documentId,
      })
    ).versions;
    expect(experienceOf(libraryVersion.content).title).toBe("Tech Lead");
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
    const filter = await loadNeverIncludeFilter({
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
          neverIncludeFilter: filter,
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
      // Named after the person, now that the profile gives the name.
      fileName: "Ada_Lovelace_Platform_Engineer_Resume.pdf",
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
      "Ada_Lovelace_Platform_Engineer_Resume.pdf",
    ]);

    // A new snapshot needs its own PDF; undoing it deletes that file.
    await documents.saveEdit({
      userId: ctx.user.id,
      versionId: version.id,
      baseSnapshotId: version.snapshot.id,
      content: {
        ...resumeOf(version.content),
        header: {
          ...resumeOf(version.content).header,
          titleLine: "Platform Engineer",
        },
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
    expect(libraryVersion.pdf.fileName).toBe(
      "Ada_Lovelace_Platform_Resume.pdf"
    );
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

    // Adjust: the library document is what the next one starts from.
    const { generationId } = await ctx.documents.generateResume({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      language: "en-US",
      reviewDepth: "quick",
      writingLevel: "standard",
      tone: "direct",
      referenceVersionId: similar.versionId,
    });
    const [libraryLine] = experienceOf(libraryVersion.content).lines;
    const { fake } = await ctx.runScripted(generationId, {
      drafts: [
        {
          changes: ["Summary rewritten for Hooli"],
          title_line: "Platform Engineer | Kubernetes",
          summary: null,
          skills: [],
          experience: [],
        },
      ],
      ratings: [8],
    });
    const adjuster = fake.generateObject.mock.calls[0][0].system;
    expect(adjuster).toMatch(/^You adjust an existing resume/);
    expect(adjuster).toContain(
      `bullet [${libraryLine.id}] Led a team of 5 engineers.`
    );
    // Named or not, what the library document says is kept as it is.
    const adjusted = (
      await ctx.documents.forOpening({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
      })
    ).documents[0].versions.find((version) => version.emphasis?.adjusted)!;
    expect(resumeOf(adjusted.content).sections).toEqual(
      resumeOf(libraryVersion.content).sections
    );
    expect(adjusted.emphasis?.lines).toEqual(["Summary rewritten for Hooli"]);
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
      const filter = await loadNeverIncludeFilter({
        db: ctx.db,
        cipher: ctx.cipher,
        profileId: ctx.profile.id,
      });
      const fake = fakeProviderPackage({
        object: ({ system }) =>
          system.startsWith("You audit") ? emptyCoverage : queue.shift(),
      });
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
          neverIncludeFilter: filter,
        }),
        cipher: ctx.cipher,
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
          | "instruction_ids",
          string[]
        >
      >
    ) => ({
      text,
      evidence_ids: [],
      company_fact_ids: [],
      motivation_point_ids: [],
      instruction_ids: [],
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

    const deploy = (await ctx.readCareer()).evidence.find((row) =>
      row.text.includes("Cut deploy time by 40%")
    )!;
    const { generationId } = await letters.generate({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      language: "en-US",
      tone: "warm",
      writingLevel: "standard",
      resumeVersionId: resumeVersion.id,
      storyLineId: deploy.id,
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
    // The refused draft, its fix and the coverage review.
    expect(fake.generateObject).toHaveBeenCalledTimes(3);
    const prompt = fake.generateObject.mock.calls[0][0];
    expect(prompt.system).toContain("one convincing story");
    expect(prompt.system).toContain("At most 4 paragraphs");
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
    expect(letter.maxPages).toBe(defaultGenerationSettings.letterMaxPages);
    // Frozen when asked for (its resume's version), with the coverage
    // review: the code checks pass and the AI review ends with the statement.
    const [letterGeneration] = await ctx.db
      .select()
      .from(generationsTable)
      .where(eq(generationsTable.id, generationId));
    expect(letterGeneration).toMatchObject({
      profileVersionId: ctx.context.profileVersionId,
      settings: defaultGenerationSettings,
    });
    expect(
      (await new DocumentsRepository(ctx.db).findSnapshot(letter.snapshot.id))
        ?.profileVersionId
    ).toBe(ctx.context.profileVersionId);
    expect(letter.coverage).toMatchObject({
      findings: [],
      current: true,
      review: {
        statement:
          "This review does not claim that every mandatory requirement is met.",
      },
    });
    expect(letter.coverage?.review?.gaps).toContain("Go");

    // The resume changes: the letter is outdated relative to it.
    const editResume = async (title: string) => {
      const [current] = (await view()).documents[0].versions;
      await ctx.documents.saveEdit({
        userId: ctx.user.id,
        versionId: current.id,
        baseSnapshotId: current.snapshot.id,
        content: {
          ...resumeOf(current.content),
          header: { ...resumeOf(current.content).header, titleLine: title },
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
    const updateFake = await runLetter(updated.generationId, [
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
    // The update keeps telling the story the letter was written around.
    expect(
      JSON.stringify(updateFake.generateObject.mock.calls[0][0])
    ).toContain(`\\"story\\":{\\"id\\":\\"${deploy.id}\\"`);
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
  it("adjusts an existing resume: only the order, the summary and bullets the profile has", async () => {
    const ctx = await setup({
      markdown: profileMarkdown({
        experience: `### Acme — Developer (2017-01 to 2021-02)

- Tools: Node.js, PostgreSQL
- Results:
  - Built the order services in Node.js [no number].
`,
        competencies: ["I use often: Node.js"],
      }),
    });
    const [deploy, team] = ctx.evidence;
    const tools = ctx.lineOf("Tools: Kubernetes");
    const services = ctx.lineOf("Built the order services");
    const acmeId = ctx.context.positions[1].id;
    // Both positions are recent to this month.
    const today = "2025-06";
    // The Free plan's reserve is sized by the published profile's positions.
    expect(await creditReserve(ctx.db, ctx.user.id, new Date())).toBe(
      creditCap("generate_document", { positions: 2 })
    );
    const base = ctx.draft([
      {
        text: "Cut deploy time by 40% with Kubernetes.",
        evidence_ids: [deploy.id],
      },
      { text: "Led a team of 5 engineers.", evidence_ids: [team.id] },
    ]);
    await ctx.generate("quick", {
      drafts: [
        {
          ...base,
          skills: [
            {
              label: "Core",
              items: ["Kubernetes", "Terraform", "Node.js"],
              evidence_ids: [],
            },
          ],
          experience: [
            ...base.experience,
            {
              position_id: acmeId,
              context: null,
              relevance: null,
              bullets: [
                {
                  text: "Built the order services in Node.js.",
                  evidence_ids: [services.id],
                },
              ],
            },
          ],
        },
      ],
      ratings: [9],
      today,
    });
    const versions = async () =>
      (
        await ctx.documents.forOpening({
          userId: ctx.user.id,
          openingId: ctx.opening.id,
        })
      ).documents[0].versions;
    const [reference] = await versions();
    // The resume the user came for exists: nothing is kept any more.
    expect(await creditReserve(ctx.db, ctx.user.id, new Date())).toBe(0);
    const sectionsOf = (content: DocumentContent) => {
      const { sections } = resumeOf(content);
      const summary = sections.find((s) => s.kind === "summary");
      const skills = sections.find((s) => s.kind === "skills");
      const experience = sections.find((s) => s.kind === "experience");
      if (
        summary?.kind !== "summary" ||
        skills?.kind !== "skills" ||
        experience?.kind !== "experience"
      ) {
        throw new Error("a section is missing");
      }
      return {
        summary: summary.line,
        groups: skills.groups,
        globex: experience.entries[0],
        acme: experience.entries[1],
      };
    };
    const before = sectionsOf(reference.content);
    const [deployLine, teamLine] = before.globex.lines;
    expect(before.groups.map((group) => group.text)).toEqual([
      "Kubernetes, Terraform, Node.js",
    ]);
    expect(reference.emphasis).toEqual({
      lines: ["Kubernetes and deploys first"],
      adjusted: false,
    });
    const documentView = async () =>
      (
        await ctx.documents.forOpening({
          userId: ctx.user.id,
          openingId: ctx.opening.id,
        })
      ).documents[0];
    expect((await documentView()).generation).toMatchObject({
      adjusted: false,
    });
    // Written under the default settings: two pages at most.
    expect(reference.maxPages).toBe(2);

    // Thorough or not, an adjustment is one call and no review; and it
    // is in the reference's language, whatever language is asked for.
    const { generationId } = await ctx.documents.generateResume({
      ...ctx.request,
      language: "pt-BR",
      reviewDepth: "thorough",
      referenceVersionId: reference.id,
    });
    expect(
      await new DocumentsRepository(ctx.db).findGeneration(generationId)
    ).toMatchObject({ language: "en-US" });
    expect((await documentView()).generation).toMatchObject({
      id: generationId,
      adjusted: true,
      language: "en-US",
    });
    const { fake } = await ctx.runScripted(generationId, {
      drafts: [
        {
          changes: ["Team leadership first", "Node.js before Kubernetes"],
          title_line: "Platform Engineer | Kubernetes",
          summary: {
            text: "Tech lead of a team of 5 engineers.",
            evidence_ids: [team.id],
          },
          skills: [
            {
              group_id: before.groups[0].id,
              // Rust is not in the resume: nothing new enters.
              items: ["node.js", "Terraform", "Rust"],
            },
          ],
          experience: [
            {
              position_id: ctx.positionId,
              relevance: null,
              // An unknown id and a repeated one change nothing.
              bullet_ids: [teamLine.id, "not-a-bullet", teamLine.id],
              added: [
                {
                  text: "Ran the platform's Terraform modules.",
                  evidence_ids: [tools.id],
                },
                // A line of another position backs nothing here.
                {
                  text: "Built order services in Node.js.",
                  evidence_ids: [services.id],
                },
                // Nor does a line of this one back a number it doesn't show.
                {
                  text: "Ran Terraform for 12 teams.",
                  evidence_ids: [tools.id],
                },
              ],
            },
          ],
        },
      ],
      ratings: [6],
      today,
    });
    // The adjuster, then the coverage review; no review round.
    expect(
      fake.generateObject.mock.calls.map(([call]) => call.system.slice(0, 10))
    ).toEqual(["You adjust", "You audit "]);
    expect(fake.generateObject.mock.calls[0][0].system).toContain(
      `bullet [${deployLine.id}] Cut deploy time by 40% with Kubernetes.`
    );

    const adjusted = (await versions()).find(
      (version) => version.id !== reference.id
    )!;
    expect(adjusted.language).toBe("en-US");
    const after = sectionsOf(adjusted.content);
    // Every bullet of the reference, word for word, in the order asked;
    // the one the profile backs is added after the ones named.
    expect(after.globex.lines).toEqual([
      teamLine,
      expect.objectContaining({
        text: "Ran the platform's Terraform modules.",
        origin: { kind: "evidence", evidenceIds: [tools.id] },
      }),
      deployLine,
    ]);
    expect(after.acme).toEqual(before.acme);
    // The same competencies, reordered.
    expect(after.groups).toEqual([
      { ...before.groups[0], text: "Node.js, Terraform, Kubernetes" },
    ]);
    // Only the summary is rewritten.
    expect(after.summary).toMatchObject({
      text: "Tech lead of a team of 5 engineers.",
      origin: { kind: "evidence", evidenceIds: [team.id] },
    });
    expect(after.summary.id).not.toBe(before.summary.id);
    expect(adjusted.emphasis).toEqual({
      lines: ["Team leadership first", "Node.js before Kubernetes"],
      adjusted: true,
    });
    // Nothing was judged, so no round is stored and none is the best.
    const repository = new DocumentsRepository(ctx.db);
    expect(await repository.listReviewRounds(generationId)).toEqual([]);
    expect(await repository.findGeneration(generationId)).toMatchObject({
      status: "completed",
      bestRound: null,
    });
    // The version it started from is untouched.
    expect((await versions())[0].content).toEqual(reference.content);
  });

  it("re-checks what an adjustment keeps against the profile frozen now", async () => {
    const ctx = await setup();
    const [deploy, team] = ctx.evidence;
    await ctx.generate("quick", {
      drafts: [
        {
          ...ctx.draft([
            {
              text: "Cut deploy time by 40% with Kubernetes.",
              evidence_ids: [deploy.id],
            },
            { text: "Led a team of 5 engineers.", evidence_ids: [team.id] },
          ]),
          skills: [
            {
              label: "Core",
              items: ["Kubernetes", "Terraform"],
              evidence_ids: [deploy.id],
            },
          ],
        },
      ],
      ratings: [9],
    });
    const versions = async () =>
      (
        await ctx.documents.forOpening({
          userId: ctx.user.id,
          openingId: ctx.opening.id,
        })
      ).documents[0].versions;
    const [reference] = await versions();
    const before = experienceOf(reference.content);
    const [deployLine, teamLine] = before.lines;
    expect(resumeOf(reference.content).sections[0]).toMatchObject({
      kind: "summary",
      line: { text: "Engineer who cut deploy time by 40%." },
    });

    // Published since: the deploy figure is only estimated now, and
    // Terraform was only studied.
    await ctx.publishProfile(
      profileMarkdown()
        .replace("[measured: CI dashboard]", "[estimated]")
        .replace(
          "- I master: Kubernetes, Terraform",
          "- I master: Kubernetes\n- Studied, without professional experience: Terraform"
        )
    );
    const { generationId } = await ctx.documents.generateResume({
      ...ctx.request,
      referenceVersionId: reference.id,
    });
    const { fake } = await ctx.runScripted(generationId, {
      drafts: [
        {
          changes: ["Team first"],
          title_line: "Platform Engineer | Kubernetes",
          summary: null,
          skills: [],
          experience: [
            {
              position_id: ctx.positionId,
              relevance: null,
              bullet_ids: [teamLine.id, deployLine.id],
              added: [],
            },
          ],
        },
      ],
      ratings: [],
    });
    // The adjuster and the coverage review; no review round rates it.
    expect(fake.generateObject).toHaveBeenCalledTimes(2);
    expect(
      await new DocumentsRepository(ctx.db).listReviewRounds(generationId)
    ).toEqual([]);

    const adjusted = (await versions()).find(
      (version) => version.id !== reference.id
    )!;
    const { sections } = resumeOf(adjusted.content);
    // The kept bullet with the figure, the kept summary with it, and the
    // competency only studied no longer hold: they go.
    expect(experienceOf(adjusted.content).lines).toEqual([teamLine]);
    expect(sections.find((s) => s.kind === "summary")).toBeUndefined();
    expect(sections.find((s) => s.kind === "skills")).toMatchObject({
      groups: [{ text: "Kubernetes" }],
    });
    expect(JSON.stringify(adjusted.content)).not.toMatch(/40%|Terraform/);
    // The reference keeps saying what it said.
    expect((await versions())[0].content).toEqual(reference.content);
  });

  it("carries the profile version a snapshot's text was written from", async () => {
    const ctx = await setup();
    const repository = new DocumentsRepository(ctx.db);
    const frozen = ctx.context.profileVersionId!;
    const line = {
      text: "Led a team of 5 engineers.",
      evidence_ids: [ctx.evidence[1].id],
    };
    await ctx.generate("quick", { drafts: [ctx.draft([line])], ratings: [9] });
    const load = async () =>
      (
        await ctx.documents.forOpening({
          userId: ctx.user.id,
          openingId: ctx.opening.id,
        })
      ).documents[0].versions;
    const versionOf = async (snapshotId: string) =>
      (await repository.findSnapshot(snapshotId))?.profileVersionId;
    const [version] = await load();
    const generated = version.snapshot.id;
    // The generated snapshot holds the version the generation froze.
    expect(await versionOf(generated)).toBe(frozen);

    // An edit is of that text, so of that version.
    await ctx.documents.saveEdit({
      userId: ctx.user.id,
      versionId: version.id,
      baseSnapshotId: generated,
      content: {
        ...resumeOf(version.content),
        header: {
          ...resumeOf(version.content).header,
          titleLine: "Platform Engineer",
        },
      },
    });
    const [edited] = await load();
    expect(edited.snapshot.id).not.toBe(generated);
    expect(await versionOf(edited.snapshot.id)).toBe(frozen);

    // The profile is republished with a corrected title, and the same
    // version is generated again from it.
    await ctx.publishProfile(
      profileMarkdown().replace("Tech Lead", "Technical Lead")
    );
    const later = await ctx.readCareer();
    expect(later.profileVersionId).not.toBe(frozen);
    expect(later.positions[0].id).not.toBe(ctx.positionId);
    const { generationId } = await ctx.documents.generateResume({
      ...ctx.request,
      versionId: version.id,
    });
    const laterTeam = ctx.lineOf("Led a team of 5 engineers", later);
    await ctx.runScripted(generationId, {
      drafts: [
        {
          ...ctx.draft([], laterTeam.id),
          experience: [
            {
              position_id: later.positions[0].id,
              context: null,
              relevance: null,
              bullets: [{ ...line, evidence_ids: [laterTeam.id] }],
            },
          ],
        },
      ],
      ratings: [9],
    });
    const [regenerated] = await load();
    expect(experienceOf(regenerated.content).title).toBe("Technical Lead");
    expect(await versionOf(regenerated.snapshot.id)).toBe(
      later.profileVersionId
    );

    // Restoring the first text brings its version back with it; an edit
    // and a duplicate of that text inherit it, not the newer one.
    await ctx.documents.restore({
      userId: ctx.user.id,
      snapshotId: generated,
    });
    const [restored] = await load();
    expect(restored.snapshot.origin).toBe("restored");
    expect(experienceOf(restored.content).title).toBe("Tech Lead");
    expect(await versionOf(restored.snapshot.id)).toBe(frozen);
    const { versionId: copyId } = await ctx.documents.duplicate({
      userId: ctx.user.id,
      versionId: version.id,
    });
    const copy = (await load()).find((row) => row.id === copyId)!;
    expect(await versionOf(copy.snapshot.id)).toBe(frozen);

    // Adapting that text reads its own version: its positions are the
    // ones the content holds, whatever was generated in the document since.
    const tasks = new TasksService(ctx.db, ctx.trigger);
    const adapted = await new AdaptationService(ctx.db, tasks).adapt({
      userId: ctx.user.id,
      versionId: version.id,
      language: "pt-BR",
    });
    const filter = await loadNeverIncludeFilter({
      db: ctx.db,
      cipher: ctx.cipher,
      profileId: ctx.profile.id,
    });
    const [teamLine] = experienceOf(restored.content).lines;
    const fake = fakeProviderPackage({
      object: () => ({
        title_line: "",
        items: [
          {
            id: teamLine.id,
            text: "Liderou uma equipe de 5 engenheiros.",
            label: null,
          },
        ],
        contexts: [],
        title_equivalents: [],
      }),
    });
    await runAdaptDocument({
      db: ctx.db,
      ai: createAiClient({
        db: ctx.db,
        userId: ctx.user.id,
        funding: "credits",
        providerPackage: fake.providerPackage,
        neverIncludeFilter: filter,
      }),
      cipher: ctx.cipher,
      filter,
      userId: ctx.user.id,
      generationId: adapted.generationId,
    });
    const portuguese = (await load()).find((row) => row.language === "pt-BR")!;
    expect(experienceOf(portuguese.content)).toMatchObject({
      positionId: ctx.positionId,
      title: "Tech Lead",
      lines: [
        { id: teamLine.id, text: "Liderou uma equipe de 5 engenheiros." },
      ],
    });
    expect(await versionOf(portuguese.snapshot.id)).toBe(frozen);
  });

  it("writes the cover letter from its frozen profile within the settings, reviews it and sends its own words to the profile", async () => {
    const ctx = await setup({ markdown: null });
    const tasks = new TasksService(ctx.db, ctx.trigger);
    const letters = new LetterService(ctx.db, tasks);
    const asked = {
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      language: "en-US" as const,
      tone: "warm" as const,
      writingLevel: "standard" as const,
      resumeVersionId: null,
    };
    // Nothing is generated before a profile is published.
    await expect(letters.generate(asked)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });

    await ctx.publishProfile(profileMarkdown());
    const frozen = (await ctx.readCareer()).profileVersionId;
    const career = await ctx.readCareer();
    const positionId = career.positions[0].id;
    const deploy = career.evidence.find((row) =>
      row.text.includes("Cut deploy time by 40%")
    )!;
    const [team] = await new InstructionsRepository(ctx.db).insertPoints([
      {
        profileId: ctx.profile.id,
        openingId: ctx.opening.id,
        source: "written",
        sequence: 1,
        encryptedText: ctx.cipher.encrypt("I led 8 engineers at Globex."),
        status: "kept",
        positionId,
        confirmedAt: new Date(),
      },
    ]);

    // The story choice: the profile's results lines, with what they answer.
    const stories = await letters.stories({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
    });
    expect(stories[0]).toMatchObject({
      lineId: deploy.id,
      position: { employer: "Globex", title: "Tech Lead" },
      fits: ["Kubernetes"],
    });
    // Only a results line can be the story.
    await expect(
      letters.generate({ ...asked, storyLineId: career.evidence[1].id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const { generationId } = await letters.generate({
      ...asked,
      settings: { letterMaxParagraphs: 2 },
      storyLineId: stories[0].lineId,
    });
    // The profile moves on after the request: the letter keeps its version.
    await ctx.publishProfile(profileMarkdown().replace("40%", "45%"));

    const cite = (
      text: string,
      ids: { evidence_ids?: string[]; instruction_ids?: string[] }
    ) => ({
      text,
      evidence_ids: [],
      company_fact_ids: [],
      motivation_point_ids: [],
      instruction_ids: [],
      ...ids,
    });
    const opening = cite("I led 8 engineers at Globex.", {
      instruction_ids: [team.id],
    });
    const story = cite("At Globex I cut deploy time by 40% with Kubernetes.", {
      evidence_ids: [deploy.id],
    });
    const closing = cite("I would love to talk.", {
      instruction_ids: [team.id],
    });
    const drafts = [
      // One paragraph too long: rewritten to fit.
      {
        greeting: "Dear Hooli team,",
        paragraphs: [opening, story, closing],
        closing: "Sincerely,",
      },
      {
        greeting: "Dear Hooli team,",
        paragraphs: [opening, story],
        closing: "Sincerely,",
      },
    ];
    const filter = await loadNeverIncludeFilter({
      db: ctx.db,
      cipher: ctx.cipher,
      profileId: ctx.profile.id,
    });
    const fake = fakeProviderPackage({
      object: ({ system }) => {
        if (system.startsWith("You audit")) {
          const ids = reviewedLineIds(system);
          return {
            ...emptyCoverage,
            suggestions: [
              {
                kind: "profile",
                line_id: ids.get("I led 8 engineers at Globex."),
                text: "The team of 8 is not in the profile's Globex results.",
              },
            ],
          };
        }
        return drafts.shift();
      },
    });
    await runGenerateLetter({
      db: ctx.db,
      ai: createAiClient({
        db: ctx.db,
        userId: ctx.user.id,
        funding: "credits",
        providerPackage: fake.providerPackage,
        neverIncludeFilter: filter,
      }),
      cipher: ctx.cipher,
      userId: ctx.user.id,
      generationId,
    });
    // The draft, its rewrite and the coverage review.
    expect(fake.generateObject).toHaveBeenCalledTimes(3);
    const [first, rewrite] = fake.generateObject.mock.calls.map(
      ([request]) => request
    );
    expect(first.system).toContain("At most 2 paragraphs");
    expect(JSON.stringify(first)).toContain("Cut deploy time by 40%");
    expect(JSON.stringify(first)).toContain('\\"story\\":{\\"id\\":');
    expect(rewrite.system).toContain("the limit is 2 paragraphs");

    const [stored] = await ctx.db
      .select()
      .from(generationsTable)
      .where(eq(generationsTable.id, generationId));
    expect(stored).toMatchObject({
      status: "completed",
      profileVersionId: frozen,
      storyLineId: deploy.id,
      settings: { ...defaultGenerationSettings, letterMaxParagraphs: 2 },
    });
    const letterDocument = async () =>
      (
        await ctx.documents.forOpening({
          userId: ctx.user.id,
          openingId: ctx.opening.id,
        })
      ).documents.find((document) => document.kind === "cover_letter")!;
    const [letter] = (await letterDocument()).versions;
    expect(
      (letter.content as CoverLetterContent).paragraphs.map((line) => line.text)
    ).toEqual([opening.text, story.text]);
    expect(
      (await new DocumentsRepository(ctx.db).findSnapshot(letter.snapshot.id))
        ?.profileVersionId
    ).toBe(frozen);
    expect(letter.maxPages).toBe(1);
    // The instruction traces like any other.
    expect(letter.instructionTrace).toEqual([
      { instructionId: team.id, text: "I led 8 engineers at Globex." },
    ]);
    expect(letter.coverage).toMatchObject({ findings: [], current: true });

    // “Send to my profile”: the instruction's statement, under its position.
    const review = letter.coverage!.review!;
    expect(review.suggestions).toMatchObject([
      { kind: "profile", lineText: "I led 8 engineers at Globex." },
    ]);
    const { profileSuggestionId } = await ctx.documents.sendToProfile({
      userId: ctx.user.id,
      coverageReviewId: review.id,
      lineId: review.suggestions[0].lineId!,
    });
    const profiles = new ProfileService(ctx.db, tasks);
    expect(await profiles.listSuggestions(ctx.user.id)).toMatchObject([
      {
        id: profileSuggestionId,
        origin: "application",
        part: "experience:globex — tech lead",
        find: "  - Cut cloud costs by 30% [estimated].",
        replace:
          "  - Cut cloud costs by 30% [estimated].\n  - I led 8 engineers at Globex.",
      },
    ]);

    // A hand edit is checked live: a third paragraph and a figure the
    // profile doesn't mark measured block the letter.
    const edited = letter.content as CoverLetterContent;
    await ctx.documents.saveEdit({
      userId: ctx.user.id,
      versionId: letter.id,
      baseSnapshotId: letter.snapshot.id,
      content: {
        ...edited,
        paragraphs: [
          ...edited.paragraphs,
          {
            id: "own",
            text: "I cut costs by 99%.",
            origin: { kind: "manual" },
          },
        ],
      },
    });
    const [after] = (await letterDocument()).versions;
    expect(after.coverage?.findings.map((row) => row.code)).toEqual([
      "paragraphs",
      "figure",
    ]);
    // The AI review isn't run again after an edit.
    expect(after.coverage).toMatchObject({ current: false });
  });

  it("lets a paragraph cite the career direction, and sends the instruction its review speaks of to the profile", async () => {
    const ctx = await setup({ markdown: null });
    await ctx.publishProfile(
      profileMarkdown({ direction: "Platform work with 3 teams at scale." })
    );
    const tasks = new TasksService(ctx.db, ctx.trigger);
    const letters = new LetterService(ctx.db, tasks);
    const career = await ctx.readCareer();
    const positionId = career.positions[0].id;
    const direction = (
      await loadProfileSource({
        db: ctx.db,
        cipher: ctx.cipher,
        profileId: ctx.profile.id,
      })
    )?.careerDirection[0];
    expect(direction?.text).toBe("Platform work with 3 teams at scale.");
    const [led, mentored] = await new InstructionsRepository(
      ctx.db
    ).insertPoints(
      ["I led 8 engineers at Globex.", "I mentored 4 juniors at Globex."].map(
        (text, index) => ({
          profileId: ctx.profile.id,
          openingId: ctx.opening.id,
          source: "written" as const,
          sequence: index + 1,
          encryptedText: ctx.cipher.encrypt(text),
          status: "kept" as const,
          positionId,
          confirmedAt: new Date(),
        })
      )
    );
    const { generationId } = await letters.generate({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      language: "en-US",
      tone: "warm",
      writingLevel: "standard",
      resumeVersionId: null,
    });
    const cite = (
      text: string,
      ids: { evidence_ids?: string[]; instruction_ids?: string[] }
    ) => ({
      text,
      evidence_ids: [],
      company_fact_ids: [],
      motivation_point_ids: [],
      instruction_ids: [],
      ...ids,
    });
    const aim = cite("I want platform work with 3 teams at scale.", {
      evidence_ids: [direction!.id],
    });
    const people = cite("I led 8 engineers and mentored 4 juniors.", {
      instruction_ids: [led.id, mentored.id],
    });
    const filter = await loadNeverIncludeFilter({
      db: ctx.db,
      cipher: ctx.cipher,
      profileId: ctx.profile.id,
    });
    const fake = fakeProviderPackage({
      object: ({ system }) =>
        system.startsWith("You audit")
          ? {
              ...emptyCoverage,
              suggestions: [
                {
                  kind: "profile",
                  line_id: reviewedLineIds(system).get(people.text),
                  text: "The juniors mentored are not in the profile.",
                },
              ],
            }
          : {
              greeting: "Dear Hooli team,",
              paragraphs: [aim, people],
              closing: "Sincerely,",
            },
    });
    await runGenerateLetter({
      db: ctx.db,
      ai: createAiClient({
        db: ctx.db,
        userId: ctx.user.id,
        funding: "credits",
        providerPackage: fake.providerPackage,
        neverIncludeFilter: filter,
      }),
      cipher: ctx.cipher,
      userId: ctx.user.id,
      generationId,
    });
    // The writer is handed the career direction as a source it may cite.
    expect(JSON.stringify(fake.generateObject.mock.calls[0][0])).toContain(
      `\\"id\\":\\"${direction!.id}\\"`
    );
    const [letter] = (
      await ctx.documents.forOpening({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
      })
    ).documents.find((document) => document.kind === "cover_letter")!.versions;
    expect((letter.content as CoverLetterContent).paragraphs).toMatchObject([
      { text: aim.text, origin: { evidenceIds: [direction!.id] } },
      { text: people.text },
    ]);
    expect(letter.coverage?.findings).toEqual([]);

    // “Send to my profile” sends the instruction the suggestion speaks of.
    const review = letter.coverage!.review!;
    await ctx.documents.sendToProfile({
      userId: ctx.user.id,
      coverageReviewId: review.id,
      lineId: review.suggestions[0].lineId!,
    });
    const suggested = await new ProfileService(ctx.db, tasks).listSuggestions(
      ctx.user.id
    );
    expect(suggested.map((row) => row.replace)).toEqual([
      expect.stringContaining("I mentored 4 juniors at Globex."),
    ]);
  });

  it("keeps a copied resume's profile version, and a cover letter takes its resume's", async () => {
    const ctx = await setup();
    const repository = new DocumentsRepository(ctx.db);
    const frozen = ctx.context.profileVersionId!;
    const team = ctx.evidence[1];
    const tasks = new TasksService(ctx.db, ctx.trigger);
    const library = new LibraryService(ctx.db, tasks);
    const created = await library.generateResume({
      userId: ctx.user.id,
      focus: "Platform",
      language: "en-US",
      reviewDepth: "quick",
      writingLevel: "standard",
      tone: "direct",
    });
    await ctx.runScripted(created.generationId, {
      drafts: [
        ctx.draft([
          { text: "Led a team of 5 engineers.", evidence_ids: [team.id] },
        ]),
      ],
      ratings: [9],
    });
    const [libraryVersion] = (
      await ctx.documents.libraryDocument({
        userId: ctx.user.id,
        documentId: created.documentId,
      })
    ).versions;
    const versionOf = async (snapshotId: string) =>
      (await repository.findSnapshot(snapshotId))?.profileVersionId;
    expect(await versionOf(libraryVersion.snapshot.id)).toBe(frozen);

    // The profile moves on; the copy is still of the text as written.
    await ctx.publishProfile(profileMarkdown().replace("40%", "45%"));
    const later = await ctx.readCareer();
    expect(later.profileVersionId).not.toBe(frozen);
    await library.copyIntoApplication({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      versionId: libraryVersion.id,
      language: "en-US",
    });
    const view = () =>
      ctx.documents.forOpening({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
      });
    const [copied] = (await view()).documents[0].versions;
    expect(copied.snapshot.origin).toBe("copied");
    expect(await versionOf(copied.snapshot.id)).toBe(frozen);

    // The letter reads the lines its resume cites from that version.
    const letters = new LetterService(ctx.db, tasks);
    const { generationId } = await letters.generate({
      userId: ctx.user.id,
      openingId: ctx.opening.id,
      language: "en-US",
      tone: "warm",
      writingLevel: "standard",
      resumeVersionId: copied.id,
    });
    const paragraph = (text: string, evidence_ids: string[]) => ({
      text,
      evidence_ids,
      company_fact_ids: [],
      motivation_point_ids: [],
      instruction_ids: [],
    });
    const filter = await loadNeverIncludeFilter({
      db: ctx.db,
      cipher: ctx.cipher,
      profileId: ctx.profile.id,
    });
    const fake = fakeProviderPackage({
      object: ({ system }) =>
        system.startsWith("You audit")
          ? emptyCoverage
          : {
              greeting: "Dear Hooli team,",
              paragraphs: [
                paragraph("At Globex I led a team of 5 engineers.", [team.id]),
              ],
              closing: "Sincerely,",
            },
    });
    await runGenerateLetter({
      db: ctx.db,
      ai: createAiClient({
        db: ctx.db,
        userId: ctx.user.id,
        funding: "credits",
        providerPackage: fake.providerPackage,
        neverIncludeFilter: filter,
      }),
      cipher: ctx.cipher,
      userId: ctx.user.id,
      generationId,
    });
    const [letter] = (await view()).documents.find(
      (document) => document.kind === "cover_letter"
    )!.versions;
    expect(letter.content).toMatchObject({
      kind: "cover_letter",
      paragraphs: [
        {
          text: "At Globex I led a team of 5 engineers.",
          origin: { kind: "letter", evidenceIds: [team.id] },
        },
      ],
    });
    expect(await versionOf(letter.snapshot.id)).toBe(frozen);
  });

  it("refuses to generate before a profile is published", async () => {
    const ctx = await setup({ markdown: null });
    const refusal = {
      code: "PRECONDITION_FAILED",
      message: "Publish your profile before generating a document.",
    };
    await expect(
      ctx.documents.generateResume(ctx.request)
    ).rejects.toMatchObject(refusal);
    await expect(
      new LibraryService(
        ctx.db,
        new TasksService(ctx.db, ctx.trigger)
      ).generateResume({
        userId: ctx.user.id,
        focus: "Platform",
        language: "en-US",
        reviewDepth: "quick",
        writingLevel: "standard",
        tone: "direct",
      })
    ).rejects.toMatchObject(refusal);
    // Nothing was started.
    expect(ctx.trigger.trigger).not.toHaveBeenCalled();
    // Until a profile is published, a resume is sized for a usual career.
    expect(await creditReserve(ctx.db, ctx.user.id, new Date())).toBe(
      creditCap("generate_document", {})
    );
    expect(
      (
        await ctx.documents.forOpening({
          userId: ctx.user.id,
          openingId: ctx.opening.id,
        })
      ).application
    ).toBeNull();
  });

  it("freezes the published version and the settings when a generation is asked for", async () => {
    const ctx = await setup();
    const [deploy, team] = ctx.evidence;
    const repository = new DocumentsRepository(ctx.db);
    const { generationId } = await ctx.documents.generateResume({
      ...ctx.request,
      settings: { bulletsRecent: 1, veryOld: "leave_out" },
    });
    expect(await repository.findGeneration(generationId)).toMatchObject({
      profileVersionId: ctx.context.profileVersionId,
      settings: {
        ...defaultGenerationSettings,
        bulletsRecent: 1,
        veryOld: "leave_out",
      },
    });

    // The profile changes before the task runs.
    await ctx.publishProfile(
      profileMarkdown()
        .replace("Ada Lovelace", "Ada King")
        .replace("Tech Lead", "Engineering Director")
        .replace("by 40%", "by 55%")
        .replace("English — C1", "English — C2")
    );
    const later = await ctx.readCareer();
    expect(later.profileVersionId).not.toBe(ctx.context.profileVersionId);
    expect(later.positions).toMatchObject([{ title: "Engineering Director" }]);

    const bullets = (figure: string, deployId: string, teamId: string) => [
      {
        text: `Cut deploy time by ${figure} with Kubernetes.`,
        evidence_ids: [deployId],
      },
      { text: "Led a team of 5 engineers.", evidence_ids: [teamId] },
    ];
    await ctx.runScripted(generationId, {
      drafts: [ctx.draft(bullets("40%", deploy.id, team.id))],
      ratings: [9],
    });
    const versions = async () =>
      (
        await ctx.documents.forOpening({
          userId: ctx.user.id,
          openingId: ctx.opening.id,
        })
      ).documents[0].versions;
    const languageOf = (content: DocumentContent) => {
      const section = resumeOf(content).sections.find(
        (s) => s.kind === "languages"
      );
      return section?.kind === "languages" ? section.entries[0].level : null;
    };
    // The resume prints the version it froze, under its own settings.
    const [frozen] = await versions();
    expect(resumeOf(frozen.content).header.name).toBe("Ada Lovelace");
    expect(experienceOf(frozen.content)).toMatchObject({
      positionId: ctx.positionId,
      title: "Tech Lead",
      lines: [{ text: "Cut deploy time by 40% with Kubernetes." }],
    });
    expect(experienceOf(frozen.content).lines).toHaveLength(1);
    expect(languageOf(frozen.content)).toBe("C1");
    expect(JSON.stringify(frozen.content)).not.toMatch(/Director|55%|King/);

    // One asked for now reads the version published since.
    const next = await ctx.documents.generateResume(ctx.request);
    expect(await repository.findGeneration(next.generationId)).toMatchObject({
      profileVersionId: later.profileVersionId,
      settings: defaultGenerationSettings,
    });
    const laterDeploy = ctx.lineOf("Cut deploy time by 55%", later);
    const laterTeam = ctx.lineOf("Led a team of 5 engineers", later);
    const draftOf = (figure: string): ResumeDraft => ({
      ...ctx.draft([], laterDeploy.id),
      summary: null,
      experience: [
        {
          position_id: later.positions[0].id,
          context: null,
          relevance: null,
          bullets: bullets(figure, laterDeploy.id, laterTeam.id),
        },
      ],
    });
    // The figure of the version before is no longer one the profile shows.
    await ctx.runScripted(next.generationId, {
      drafts: [draftOf("40%"), draftOf("55%")],
      ratings: [6, 9],
    });
    const current = (await versions()).find(
      (version) => version.id !== frozen.id
    )!;
    expect(resumeOf(current.content).header.name).toBe("Ada King");
    expect(experienceOf(current.content)).toMatchObject({
      positionId: later.positions[0].id,
      title: "Engineering Director",
      lines: [
        { text: "Cut deploy time by 55% with Kubernetes." },
        { text: "Led a team of 5 engineers." },
      ],
    });
    expect(languageOf(current.content)).toBe("C2");
    // The first document still says what its version said.
    expect((await versions())[0].content).toEqual(frozen.content);
  });

  it("starts each generation from the user's saved generation settings", async () => {
    const ctx = await setup();
    const tasks = new TasksService(ctx.db, ctx.trigger);
    const writing = new WritingService(ctx.db, tasks);
    const repository = new DocumentsRepository(ctx.db);
    expect((await writing.get(ctx.user.id)).generationSettings).toEqual(
      defaultGenerationSettings
    );

    const saved = {
      ...defaultGenerationSettings,
      bulletsRecent: 5,
      bulletsOlder: 2,
      veryOld: "keep" as const,
      resumeMaxPages: 1,
    };
    await writing.updateGenerationSettings({
      userId: ctx.user.id,
      settings: saved,
    });
    const setupAfter = await writing.get(ctx.user.id);
    expect(setupAfter.generationSettings).toEqual(saved);
    // Saving the template keeps them, and the other way around.
    const withoutSummary = setupAfter.templateSections.map((section) =>
      section.kind === "summary" ? { ...section, enabled: false } : section
    );
    await writing.updateTemplate({
      userId: ctx.user.id,
      sections: withoutSummary,
    });
    await writing.updateGenerationSettings({
      userId: ctx.user.id,
      settings: saved,
    });
    expect(await writing.get(ctx.user.id)).toMatchObject({
      generationSettings: saved,
      templateSections: withoutSummary,
    });

    const { generationId } = await ctx.documents.generateResume(ctx.request);
    expect((await repository.findGeneration(generationId))?.settings).toEqual(
      saved
    );
    // The document's page limit is the one it was written under.
    await ctx.runScripted(generationId, {
      drafts: [
        ctx.draft([
          {
            text: "Led a team of 5 engineers.",
            evidence_ids: [ctx.evidence[1].id],
          },
        ]),
      ],
      ratings: [9],
    });
    const [version] = (
      await ctx.documents.forOpening({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
      })
    ).documents[0].versions;
    expect(version.maxPages).toBe(1);
    expect(version.pages).toBeLessThanOrEqual(1);
    // What the form changes is for that document only.
    const library = await new LibraryService(ctx.db, tasks).generateResume({
      userId: ctx.user.id,
      focus: "Platform",
      language: "en-US",
      reviewDepth: "quick",
      writingLevel: "standard",
      tone: "direct",
      settings: { bulletsRecent: 2 },
    });
    expect(
      (await repository.findGeneration(library.generationId))?.settings
    ).toEqual({ ...saved, bulletsRecent: 2 });
    expect((await writing.get(ctx.user.id)).generationSettings).toEqual(saved);
    // A value out of range never reaches a generation.
    await expect(
      ctx.documents.generateResume({
        ...ctx.request,
        settings: { resumeMaxPages: 9 },
      })
    ).rejects.toThrow();
    // Nor settings that don't hold together: "very old" must start after
    // "recent" ends, over the saved values too.
    for (const settings of [
      { veryOldYears: 3 },
      { recentYears: 20 },
      { recentYears: 10, veryOldYears: 10 },
    ]) {
      await expect(
        ctx.documents.generateResume({ ...ctx.request, settings })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("keeps a position's bullets when adjusting a resume written before its title changed in the profile", async () => {
    const ctx = await setup();
    const [deploy, team] = ctx.evidence;
    await ctx.generate("quick", {
      drafts: [
        ctx.draft([
          {
            text: "Cut deploy time by 40% with Kubernetes.",
            evidence_ids: [deploy.id],
          },
          { text: "Led a team of 5 engineers.", evidence_ids: [team.id] },
        ]),
      ],
      ratings: [9],
    });
    const versions = async () =>
      (
        await ctx.documents.forOpening({
          userId: ctx.user.id,
          openingId: ctx.opening.id,
        })
      ).documents[0].versions;
    const [reference] = await versions();
    const before = experienceOf(reference.content);
    expect(before.lines).toHaveLength(2);

    // The title is corrected in the profile: the position's id changes.
    await ctx.publishProfile(
      profileMarkdown().replace("Tech Lead", "Technical Lead")
    );
    const later = await ctx.readCareer();
    expect(later.positions).toMatchObject([{ title: "Technical Lead" }]);
    expect(later.positions[0].id).not.toBe(ctx.positionId);

    const { generationId } = await ctx.documents.generateResume({
      ...ctx.request,
      referenceVersionId: reference.id,
    });
    const [deployLine, teamLine] = before.lines;
    const { fake } = await ctx.runScripted(generationId, {
      drafts: [
        {
          changes: ["Team leadership first"],
          title_line: "Platform Engineer | Kubernetes",
          summary: null,
          skills: [],
          experience: [
            {
              // The model is shown the position by the id it has now.
              position_id: later.positions[0].id,
              relevance: null,
              bullet_ids: [teamLine.id],
              added: [],
            },
          ],
        },
      ],
      ratings: [7],
    });
    expect(fake.generateObject.mock.calls[0][0].system).toContain(
      `Position ${later.positions[0].id}: `
    );
    const adjusted = (await versions()).find(
      (version) => version.id !== reference.id
    )!;
    // Found again by its start and its employer: the bullets go with it,
    // under the title the profile has now.
    expect(experienceOf(adjusted.content)).toEqual({
      ...before,
      positionId: later.positions[0].id,
      title: "Technical Lead",
      lines: [teamLine, deployLine],
    });
    // The reference keeps saying what it said.
    expect((await versions())[0].content).toEqual(reference.content);
  });

  it("never prints “[omitted]” as an employer or a credential", async () => {
    const markdown = profileMarkdown({
      experience: `### Acme — Phoenix Program Lead (2017-01 to 2021-02)

- Tools: Node.js

### Hooli — Phoenix (2012-01 to 2016-12)

- Tools: Java
`,
      certifications: [
        "CKA — CNCF — 2023-05 — valid",
        "Cloud Architect — Initrode Academy — 2022-01 — valid",
      ],
      languages: ["Klingon — basic"],
      rules: ["Never include: Globex, Phoenix, Initrode, Klingon"],
    });
    const ctx = await setup({ markdown });
    // As code prints them: a forbidden employer is confidential, a title
    // keeps what is left of it, a credential naming one is left out.
    expect(
      ctx.context.positions.map((position) => [
        position.employer,
        position.title,
      ])
    ).toEqual([
      ["Confidential", "Tech Lead"],
      ["Acme", "Program Lead"],
      ["Hooli", "Confidential"],
    ]);
    expect(
      ctx.context.credentials.map((credential) => [
        credential.kind,
        credential.title,
      ])
    ).toEqual([
      ["certification", "CKA"],
      ["language", "English"],
    ]);
    // In the document's language.
    const portuguese = await loadCareerContext({
      db: ctx.db,
      cipher: ctx.cipher,
      profileId: ctx.profile.id,
      filter: await loadNeverIncludeFilter({
        db: ctx.db,
        cipher: ctx.cipher,
        profileId: ctx.profile.id,
      }),
      language: "pt-BR",
    });
    expect(
      portuguese.positions.map((position) => [
        position.employer,
        position.title,
      ])
    ).toEqual([
      ["Confidencial", "Tech Lead"],
      ["Acme", "Program Lead"],
      ["Hooli", "Confidencial"],
    ]);

    const line = {
      text: "Led a team of 5 engineers.",
      evidence_ids: [ctx.evidence[1].id],
    };
    // Every position is recent enough to this month to be printed.
    await ctx.generate("quick", {
      drafts: [ctx.draft([line])],
      ratings: [9],
      today: "2026-01",
    });
    const [version] = (
      await ctx.documents.forOpening({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
      })
    ).documents[0].versions;
    const { sections } = resumeOf(version.content);
    const experience = sections.find((s) => s.kind === "experience");
    expect(experience).toMatchObject({
      entries: [
        { employer: "Confidential", title: "Tech Lead", startDate: "2021-03" },
        { employer: "Acme", title: "Program Lead" },
        { employer: "Hooli", title: "Confidential" },
      ],
    });
    expect(sections.find((s) => s.kind === "languages")).toMatchObject({
      entries: [{ title: "English", level: "C1" }],
    });
    expect(JSON.stringify(version.content)).not.toMatch(
      /\[omitted\]|Globex|Phoenix|Initrode|Klingon/
    );
    // The locked facts stay locked as printed.
    const tampered = structuredClone(resumeOf(version.content));
    experienceOf(tampered).employer = "Globex";
    await expect(
      ctx.documents.saveEdit({
        userId: ctx.user.id,
        versionId: version.id,
        baseSnapshotId: version.snapshot.id,
        content: tampered,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("never prints “[omitted]” in a locked-fact override's value", async () => {
    const ctx = await setup({
      markdown: profileMarkdown({
        rules: ["Never include: Phoenix, Initrode"],
      }),
    });
    // What the user confirmed for this application names what the
    // profile's rules forbid.
    await ctx.db.insert(lockedFactOverridesTable).values(
      (
        [
          ["title", "Phoenix Lead"],
          ["employer", "Initrode Labs"],
          ["start_date", "2021-01"],
        ] as const
      ).map(([field, value]) => ({
        profileId: ctx.profile.id,
        openingId: ctx.opening.id,
        positionId: ctx.positionId,
        field,
        encryptedValue: ctx.cipher.encrypt(value),
        confirmedAt: new Date(),
      }))
    );
    const filter = await loadNeverIncludeFilter({
      db: ctx.db,
      cipher: ctx.cipher,
      profileId: ctx.profile.id,
    });
    const printedIn = async (language: "en-US" | "pt-BR") => {
      const [position] = (
        await loadCareerContext({
          db: ctx.db,
          cipher: ctx.cipher,
          profileId: ctx.profile.id,
          filter,
          openingId: ctx.opening.id,
          language,
        })
      ).positions;
      return [position.employer, position.title, position.startDate];
    };
    // The same rule as for the profile's own facts: a forbidden employer
    // is confidential, a title keeps what is left of it.
    expect(await printedIn("en-US")).toEqual([
      "Confidential",
      "Lead",
      "2021-01",
    ]);
    expect(await printedIn("pt-BR")).toEqual([
      "Confidencial",
      "Lead",
      "2021-01",
    ]);
    // Outside the application nothing is overridden.
    expect(ctx.context.positions).toMatchObject([
      { employer: "Globex", title: "Tech Lead", startDate: "2021-03" },
    ]);

    const line = {
      text: "Led a team of 5 engineers.",
      evidence_ids: [ctx.evidence[1].id],
    };
    await ctx.generate("quick", { drafts: [ctx.draft([line])], ratings: [9] });
    const [version] = (
      await ctx.documents.forOpening({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
      })
    ).documents[0].versions;
    expect(experienceOf(version.content)).toMatchObject({
      positionId: ctx.positionId,
      employer: "Confidential",
      title: "Lead",
      startDate: "2021-01",
      lines: [{ text: "Led a team of 5 engineers." }],
    });
    expect(JSON.stringify(version.content)).not.toMatch(
      /\[omitted\]|Phoenix|Initrode/
    );
  });

  it("shows each version the page limit it was written under", async () => {
    const ctx = await setup();
    const line = {
      text: "Led a team of 5 engineers.",
      evidence_ids: [ctx.evidence[1].id],
    };
    const limits = async () =>
      (
        await ctx.documents.forOpening({
          userId: ctx.user.id,
          openingId: ctx.opening.id,
        })
      ).documents[0].versions.map(
        (version) => [version.id, version.maxPages] as const
      );
    await ctx.generate("quick", { drafts: [ctx.draft([line])], ratings: [9] });
    const [[first]] = await limits();
    expect(await limits()).toEqual([[first, 2]]);

    // Another one is only asked for, with another limit: nothing changes
    // for the version already written.
    const { generationId } = await ctx.documents.generateResume({
      ...ctx.request,
      settings: { resumeMaxPages: 1 },
    });
    expect(await limits()).toEqual([[first, 2]]);

    // Once written, each version has its own.
    await ctx.runScripted(generationId, {
      drafts: [ctx.draft([line])],
      ratings: [9],
    });
    const after = await limits();
    expect(after).toHaveLength(2);
    expect(after).toContainEqual([first, 2]);
    expect(after.find(([id]) => id !== first)?.[1]).toBe(1);

    // A generation that fails leaves the limits as they were.
    const failing = await ctx.documents.generateResume({
      ...ctx.request,
      versionId: first,
      settings: { resumeMaxPages: 3 },
    });
    await expect(
      ctx.runScripted(failing.generationId, { drafts: [], ratings: [] })
    ).rejects.toThrow("The strategist returned no draft");
    expect(await limits()).toEqual(after);
  });

  it("refuses to adjust into a version written in another language", async () => {
    const ctx = await setup();
    const line = {
      text: "Led a team of 5 engineers.",
      evidence_ids: [ctx.evidence[1].id],
    };
    const repository = new DocumentsRepository(ctx.db);
    // A Portuguese version and an English one of the same resume.
    for (const language of ["pt-BR", "en-US"] as const) {
      const { generationId } = await ctx.documents.generateResume({
        ...ctx.request,
        language,
      });
      await ctx.runScripted(generationId, {
        drafts: [ctx.draft([line])],
        ratings: [9],
      });
    }
    const { versions } = (
      await ctx.documents.forOpening({
        userId: ctx.user.id,
        openingId: ctx.opening.id,
      })
    ).documents[0];
    const portuguese = versions.find((v) => v.language === "pt-BR")!;
    const english = versions.find((v) => v.language === "en-US")!;

    // The English reference's bullets can't land in the Portuguese version.
    await expect(
      ctx.documents.generateResume({
        ...ctx.request,
        language: "pt-BR",
        versionId: portuguese.id,
        referenceVersionId: english.id,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      ctx.documents.generateResume({
        ...ctx.request,
        versionId: english.id,
        referenceVersionId: portuguese.id,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Into a version in the reference's language it starts, in that
    // language whatever is asked for.
    const adjusting = await ctx.documents.generateResume({
      ...ctx.request,
      language: "pt-BR",
      versionId: english.id,
      referenceVersionId: english.id,
    });
    expect(
      await repository.findGeneration(adjusting.generationId)
    ).toMatchObject({ versionId: english.id, language: "en-US" });
    // Generating again into a version stays in that version's language,
    // whatever language was sent.
    const again = await ctx.documents.generateResume({
      ...ctx.request,
      language: "pt-BR",
      versionId: english.id,
    });
    expect(await repository.findGeneration(again.generationId)).toMatchObject({
      versionId: english.id,
      language: "en-US",
    });
  });
});

describe("a draft's rating by its coverage", () => {
  const review = (
    levels: Array<"strong" | "partial" | "not_proven">,
    inconsistencies: string[] = []
  ) => ({
    coverage: levels.map((level, index) => ({
      requirement: `Requirement ${index + 1}`,
      level,
    })),
    inconsistencies,
    advice: [],
  });

  it("counts strong coverage whole and partial half, over what was judged", () => {
    expect(coverageRating(review(["strong", "strong"]), [])).toBe(10);
    expect(coverageRating(review(["strong", "partial"]), [])).toBe(8);
    expect(
      coverageRating(
        review(["strong", "partial", "not_proven", "not_proven"]),
        []
      )
    ).toBe(4);
    // Never under 1.
    expect(coverageRating(review(["not_proven", "not_proven"]), [])).toBe(1);
    expect(reviewRatings()).toEqual([1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("leaves the fit check's gaps out of the count", () => {
    const judged = {
      ...review([]),
      coverage: [
        { requirement: "Kubernetes", level: "strong" as const },
        { requirement: "Go", level: "not_proven" as const },
        { requirement: "Liderança técnica", level: "not_proven" as const },
      ],
    };
    expect(coverageRating(judged, [])).toBe(3);
    // Named as the fit check names them, whatever the case and accents.
    expect(coverageRating(judged, [" go ", "lideranca tecnica"])).toBe(10);
    // A gap the review calls covered doesn't count for the draft either.
    expect(
      coverageRating(
        {
          ...judged,
          coverage: [
            { requirement: "Kubernetes", level: "not_proven" },
            { requirement: "Go", level: "strong" },
          ],
        },
        ["Go"]
      )
    ).toBe(1);
  });

  it("caps a draft that disagrees with the profile at 4", () => {
    const wrong = ["Says 2019 where the profile says 2021"];
    expect(coverageRating(review(["strong", "strong"], wrong), [])).toBe(4);
    expect(coverageRating(review(["strong", "not_proven"], wrong), [])).toBe(4);
    expect(
      coverageRating(review(["partial", "not_proven", "not_proven"], wrong), [])
    ).toBe(2);
  });

  it("rates a draft 5 when nothing is judged", () => {
    expect(coverageRating(review([]), [])).toBe(5);
    expect(
      coverageRating(
        { ...review([]), coverage: [{ requirement: "Go", level: "strong" }] },
        ["Go"]
      )
    ).toBe(5);
  });

  /** What the scripted reviews of these tests rate, from 0 to 10 strong. */
  function reviewRatings() {
    return Array.from({ length: 11 }, (_, rating) =>
      coverageRating(reviewRated(rating), [])
    );
  }
});
