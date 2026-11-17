import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAiClient } from "@repo/api/domains/ai/ai-client";
import { CareerService } from "@repo/api/domains/career/career-service";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { ProfileService } from "@repo/api/domains/profile/profile-service";
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

const posting = `Senior Platform Engineer at Globex. We need 8+ years of experience, strong Kubernetes and Terraform, and fluent English. Spark is a plus. Remote in Brazil. ${"You will build our developer platform. ".repeat(6)}`;

const extraction = {
  title: "Senior Platform Engineer",
  company: "Globex",
  language: "en-US",
  suggested_tone: "direct",
  keywords: [
    { text: "Kubernetes", category: "tool", importance: "mandatory" },
    { text: "Terraform", category: "tool", importance: "mandatory" },
    { text: "Spark", category: "tool", importance: "desirable" },
  ],
  requirements: [
    {
      text: "8+ years of experience as a senior engineer",
      category: "years_of_experience",
      importance: "mandatory",
    },
    {
      text: "Remote in Brazil",
      category: "work_model",
      importance: "mandatory",
    },
  ],
  warnings: [],
};

const profile = `# Profile

## Professional identity

- Platform engineer.

## Contact (only what may appear on a resume)

- City and state: Belo Horizonte, MG

## Experience (most recent first)

### Acme — Platform Engineer (2016-01 to present)

- Tools: Kubernetes, Terraform
- Results:
  - Ran the Kubernetes clusters of the payments platform [no number].
  - Wrote the Terraform modules every team uses [no number].
- What I did NOT do in this position (so as not to overstate): I did not touch Kafka.

## Education

## Certifications

- CKA — CNCF — 2023-05 — valid

## Competencies

- I master: Kubernetes, Terraform
- Studied, without professional experience: Spark

## Languages

- English — fluent

## Known gaps

- Go in production.

## Communication rules
`;

const preferences = `# Job preferences

## Work model

- I accept: remote

## Accepted locations

- Brazil

## Salary range

- Minimum: R$ 20.000 CLT

## Excluded companies

- Initech (2026-10-02)

## Excluded sectors

- Betting

## Discard rules

- Contact only through a messaging app.
`;

async function setup({ publish = true }: { publish?: boolean } = {}) {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const career = new CareerService(db);
  await career.getOrCreateProfile({
    userId: user.id,
    defaultLanguage: "en-US",
  });
  const cipher = await getUserCipher(db, user.id);
  const trigger = {
    trigger: vi.fn(async () => ({ runId: "run", accessToken: "t" })),
  };
  const tasks = new TasksService(db, trigger);
  const openings = new OpeningsService(db, tasks);
  const profiles = new ProfileService(db, tasks);

  /** Saves and publishes one of the user's two documents. */
  async function publishDocument(
    markdown: string,
    kind: "profile" | "preferences" = "profile"
  ) {
    const current = await profiles.getDraft({
      userId: user.id,
      language: "en-US",
      kind,
    });
    const { revision } = await profiles.saveDraft({
      userId: user.id,
      markdown,
      baseRevision: current.revision,
      kind,
    });
    await profiles.publish({ userId: user.id, baseRevision: revision, kind });
  }
  if (publish) await publishDocument(profile);

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

  const add = async (description = posting) =>
    (await openings.createFromText({ userId: user.id, description })).openingId;
  const detail = (openingId: string) =>
    openings.get({ userId: user.id, openingId });
  return {
    db,
    user,
    cipher,
    openings,
    profiles,
    publishDocument,
    analyze,
    add,
    detail,
  };
}

type Judged = ReturnType<typeof parseJudgmentPrompt>[number];

/** Plays the classification calls of a fit check. */
function fitScript(
  judge: (terms: Judged[], system: string) => unknown,
  extracted: object = extraction,
  // The numbered preferences the opening breaks, from their own call.
  conflicts: (
    rules: string[]
  ) => Array<{ rule: number; explanation: string }> = () => []
) {
  return {
    object: (request: { system: string }) => {
      if (request.system.startsWith("Decide whether"))
        return { is_job_posting: true };
      if (request.system.startsWith("Read the job posting")) return extracted;
      if (request.system.startsWith("Screen"))
        return judge(parseJudgmentPrompt(request.system), request.system);
      if (request.system.startsWith("Check a job opening"))
        return {
          conflicts: conflicts(
            [...request.system.matchAll(/^\d+\. \[\w+\] (.*)$/gm)].map(
              (match) => match[1]
            )
          ),
        };
      return { questions: [] };
    },
  };
}

/** The requirements and the passages listed under each in the prompt. */
function parseJudgmentPrompt(system: string) {
  const blocks = system.split("Requirement ").slice(1);
  return blocks.map((block) => ({
    termId: block.split(" ")[0],
    text: block.split("\n")[0].split("]: ")[1],
    passages: [...block.matchAll(/passage ([0-9a-f-]{36}): ([^\n]*)/g)].map(
      (m) => ({ id: m[1], line: m[2] })
    ),
  }));
}

/** A judge that calls everything met, citing the first passage it was shown. */
const allMet = (terms: Judged[]) => ({
  items: terms.map((term) => ({
    term_id: term.termId,
    verdict: "met",
    passage_ids: term.passages.slice(0, 1).map((passage) => passage.id),
    explanation: "Shown in the profile.",
  })),
});

describe("openings and fit check", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("links every met requirement to a profile passage, with a band and no percentage", async () => {
    const ctx = await setup();
    const openingId = await ctx.add();
    await ctx.analyze(openingId, fitScript(allMet));

    const detail = await ctx.detail(openingId);
    expect(detail).toMatchObject({
      status: "analyzed",
      title: "Senior Platform Engineer",
      company: "Globex",
      suggestedTone: "direct",
      needsPublishedProfile: false,
    });
    const met = detail.fitCheck!.items.filter((item) => item.verdict === "met");
    expect(met.map((item) => item.term)).toEqual(
      expect.arrayContaining(["Kubernetes", "Terraform"])
    );
    // Location and work model are answered by the preferences, not a
    // passage; everything else met has one.
    for (const item of met.filter((i) => i.category !== "work_model")) {
      expect(item.passages.length).toBeGreaterThan(0);
    }
    expect(
      met.find((item) => item.term === "Kubernetes")!.passages[0].text
    ).toContain("Kubernetes");
    expect(JSON.stringify(detail)).not.toMatch(/percent|%/i);
  });

  it("makes a gap of what the profile marks studied, not done or lacking, whatever the judge says", async () => {
    const ctx = await setup();
    const openingId = await ctx.add();
    await ctx.analyze(
      openingId,
      fitScript(allMet, {
        ...extraction,
        keywords: [
          ...extraction.keywords,
          { text: "Kafka", category: "tool", importance: "mandatory" },
          { text: "Go", category: "hard_skill", importance: "desirable" },
        ],
      })
    );

    const { fitCheck } = await ctx.detail(openingId);
    const verdict = (term: string) =>
      fitCheck!.items.find((item) => item.term === term)!;
    expect(verdict("Spark")).toMatchObject({ verdict: "gap", passages: [] });
    expect(verdict("Spark").explanation).toContain("Spark");
    expect(verdict("Kafka").verdict).toBe("gap");
    expect(verdict("Kafka").explanation).toContain("I did not touch Kafka");
    expect(verdict("Go").verdict).toBe("gap");
    // Kafka is mandatory: missing it makes the band low.
    expect(fitCheck!.band).toBe("low");
  });

  it("makes a gap of a requirement the judge ties to a line of what is lacking", async () => {
    const ctx = await setup();
    const openingId = await ctx.add();
    const sentence = "Production experience operating Kafka clusters at scale";
    await ctx.analyze(
      openingId,
      fitScript(
        (terms, system) => {
          const line = Number(
            /^(\d+)\. did not do: I did not touch Kafka\.$/m.exec(system)![1]
          );
          return {
            items: allMet(terms).items.map((item) =>
              terms.find((term) => term.termId === item.term_id)!.text ===
              sentence
                ? { ...item, lack: line }
                : item
            ),
          };
        },
        {
          ...extraction,
          requirements: [
            ...extraction.requirements,
            { text: sentence, category: "other", importance: "mandatory" },
          ],
        }
      )
    );
    const { fitCheck } = await ctx.detail(openingId);
    expect(
      fitCheck!.items.find((item) => item.term === sentence)
    ).toMatchObject({
      verdict: "gap",
      passages: [],
      explanation:
        "The profile says this was not done: “I did not touch Kafka.”.",
      gapQuestion: null,
    });
    expect(fitCheck!.band).toBe("low");
  });

  it("is high when the mandatory requirements are met, a desirable gap aside", async () => {
    const ctx = await setup();
    const openingId = await ctx.add();
    await ctx.analyze(openingId, fitScript(allMet));
    const { fitCheck } = await ctx.detail(openingId);
    // Spark, studied only, is a gap, but the posting only wishes for it.
    expect(fitCheck!.items.find((item) => item.term === "Spark")!.verdict).toBe(
      "gap"
    );
    expect(fitCheck!.band).toBe("high");
  });

  it("keeps verdicts honest: a verdict with no retrieved passage is a gap", async () => {
    const ctx = await setup();
    const openingId = await ctx.add();
    await ctx.analyze(
      openingId,
      fitScript((terms) => ({
        items: terms.map((term) => ({
          term_id: term.termId,
          verdict: "met",
          passage_ids: [crypto.randomUUID()],
          explanation: "Claimed",
        })),
      }))
    );

    const { fitCheck } = await ctx.detail(openingId);
    const kubernetes = fitCheck!.items.find(
      (item) => item.term === "Kubernetes"
    )!;
    expect(kubernetes).toMatchObject({
      verdict: "gap",
      passages: [],
      explanation: "No passage of the profile backs this.",
    });
    // With no job preferences published, nothing says which work model
    // the person accepts: it is shown as unknown and left out of the band.
    expect(
      fitCheck!.items.find((item) => item.category === "work_model")
    ).toMatchObject({
      verdict: "partial",
      explanation:
        "Your job preferences don't say; write and publish them to have this checked.",
      gapQuestion: null,
    });

    // With preferences published, they answer it: no passage is needed.
    await ctx.publishDocument(preferences, "preferences");
    const second = await ctx.add();
    await ctx.analyze(
      second,
      fitScript((terms) => ({
        items: terms.map((term) => ({
          term_id: term.termId,
          verdict: "met",
          passage_ids: [],
          explanation: "Accepted",
        })),
      }))
    );
    expect(
      (await ctx.detail(second)).fitCheck!.items.find(
        (item) => item.category === "work_model"
      )!.verdict
    ).toBe("met");
  });

  it("shows the judge the overview, what is lacking and the preferences, never the whole profile", async () => {
    const ctx = await setup();
    await ctx.publishDocument(preferences, "preferences");
    const openingId = await ctx.add();
    let prompt = "";
    await ctx.analyze(
      openingId,
      fitScript((terms, system) => {
        prompt = system;
        return allMet(terms);
      })
    );

    expect(prompt).toContain(
      "- position: Platform Engineer, Acme, 2016-01 to present"
    );
    expect(prompt).toContain("- certification (valid): CKA — CNCF");
    expect(prompt).toContain("- language: English — fluent");
    expect(prompt).toContain(
      "1. studied, without professional experience: Spark"
    );
    expect(prompt).toContain("2. known gap: Go in production.");
    expect(prompt).toContain("3. did not do: I did not touch Kafka.");
    expect(prompt).toContain("- accepted work models: remote");
    expect(prompt).toContain("- salary: Minimum: R$ 20.000 CLT");
    // Excluded companies are checked by code.
    expect(prompt).not.toContain("Initech");
    // What the profile says is lacking is never retrieved as a passage.
    const passages = prompt
      .split("\n")
      .filter((line) => line.trimStart().startsWith("- passage "));
    expect(passages.length).toBeGreaterThan(0);
    expect(passages.join("\n")).not.toMatch(/Kafka|Spark|Go in production/);
  });

  it("makes the band low for an excluded company or a preference the opening breaks", async () => {
    const ctx = await setup();
    await ctx.publishDocument(preferences, "preferences");

    const excluded = await ctx.add();
    await ctx.analyze(
      excluded,
      fitScript(allMet, { ...extraction, company: "Initech Inc." })
    );
    const first = (await ctx.detail(excluded)).fitCheck!;
    expect(first.band).toBe("low");
    expect(first.preferenceConflicts).toEqual([
      {
        rule: "Initech",
        explanation:
          "The company is among those excluded in your job preferences.",
      },
    ]);

    // The other preferences are checked one by one, each by its number:
    // the rule shown is the user's own line, and a number that names no
    // line is dropped.
    const broken = await ctx.add();
    let shown: string[] = [];
    await ctx.analyze(
      broken,
      fitScript(allMet, extraction, (rules) => {
        shown = rules;
        return [
          {
            rule: rules.indexOf("Minimum: R$ 20.000 CLT") + 1,
            explanation: "Pays R$ 9.000.",
          },
          { rule: 99, explanation: "Invented." },
        ];
      })
    );
    // Excluded companies are compared by code, never listed.
    expect(shown).toEqual([
      "I accept: remote",
      "Brazil",
      "Minimum: R$ 20.000 CLT",
      "Betting",
      "Contact only through a messaging app.",
    ]);
    const second = (await ctx.detail(broken)).fitCheck!;
    expect(second.band).toBe("low");
    expect(second.preferenceConflicts).toEqual([
      { rule: "Minimum: R$ 20.000 CLT", explanation: "Pays R$ 9.000." },
    ]);
  });

  it("finds an excluded sector the posting names, whatever the judge says", async () => {
    const ctx = await setup();
    await ctx.publishDocument(preferences, "preferences");
    const openingId = await ctx.add(
      posting.replace("developer platform", "sports BETTING platform")
    );
    await ctx.analyze(openingId, fitScript(allMet));
    const { fitCheck } = await ctx.detail(openingId);
    expect(fitCheck!.band).toBe("low");
    expect(fitCheck!.preferenceConflicts).toEqual([
      {
        rule: "Betting",
        explanation:
          "The opening names this sector, excluded in your job preferences.",
      },
    ]);
  });

  it("shows the method's warning signs found in the posting", async () => {
    const ctx = await setup();
    const openingId = await ctx.add();
    await ctx.analyze(
      openingId,
      fitScript(allMet, {
        ...extraction,
        warnings: ["messaging_only_contact", "asks_payment_or_data"],
      })
    );
    expect((await ctx.detail(openingId)).warnings).toEqual([
      "messaging_only_contact",
      "asks_payment_or_data",
    ]);
  });

  it("waits for a published profile, then runs when asked again", async () => {
    const ctx = await setup({ publish: false });
    const openingId = await ctx.add();
    const fake = await ctx.analyze(
      openingId,
      fitScript(allMet, { ...extraction, warnings: ["pay_too_good"] })
    );
    // Read and kept, but nothing was judged against an empty profile.
    expect(fake.generateObject).toHaveBeenCalledTimes(2);
    expect(await ctx.detail(openingId)).toMatchObject({
      status: "analyzed",
      fitCheck: null,
      needsPublishedProfile: true,
      profilePublished: false,
      warnings: ["pay_too_good"],
    });
    // Nothing to run, and nothing to pay for, until a profile is published.
    await expect(
      ctx.openings.reanalyze({ userId: ctx.user.id, openingId })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    await ctx.publishDocument(profile);
    await ctx.openings.reanalyze({ userId: ctx.user.id, openingId });
    expect((await ctx.detail(openingId)).status).toBe("processing");
    // The opening was already read: only the fit check runs.
    const rerun = await ctx.analyze(openingId, {
      object: (request: { system: string }) => {
        if (!request.system.startsWith("Screen"))
          throw new Error(`Unexpected call: ${request.system.slice(0, 40)}`);
        return allMet(parseJudgmentPrompt(request.system));
      },
    });
    expect(rerun.generateObject).toHaveBeenCalledTimes(1);
    const after = await ctx.detail(openingId);
    expect(after).toMatchObject({
      title: "Senior Platform Engineer",
      company: "Globex",
      warnings: ["pay_too_good"],
      needsPublishedProfile: false,
    });
    expect(after.fitCheck?.band).toBe("high");
    expect(after.fitCheck?.outdated).toBe(false);

    // Published again, the profile or the preferences: the check says it
    // read an older version.
    await ctx.publishDocument(preferences, "preferences");
    expect((await ctx.detail(openingId)).fitCheck?.outdated).toBe(true);
  });

  it("keeps the opening and the gap answers when the check runs again", async () => {
    const ctx = await setup();
    const openingId = await ctx.add();
    const allGaps = fitScript((terms) => ({
      items: terms.map((term) => ({
        term_id: term.termId,
        verdict: "gap",
        passage_ids: [],
        explanation: "No",
      })),
    }));
    await ctx.analyze(openingId, {
      object: (request: { system: string }) =>
        request.system.startsWith("Write")
          ? {
              questions: [
                ...request.system.matchAll(/- ([0-9a-f-]{36}): (.*)/g),
              ].map((m) => ({ term_id: m[1], question: `About ${m[2]}?` })),
            }
          : allGaps.object(request),
    });
    const before = (await ctx.detail(openingId)).fitCheck!.items.find(
      (item) => item.term === "Terraform"
    )!;
    await ctx.openings.answerGapQuestion({
      userId: ctx.user.id,
      fitCheckItemId: before.id,
      answer: "I wrote our modules.",
    });

    await ctx.publishDocument(profile.replace("Go in production.", "Go."));
    await ctx.openings.reanalyze({ userId: ctx.user.id, openingId });
    // A check that fails leaves the opening as it was, to run again.
    await expect(
      ctx.analyze(openingId, {
        object: () => {
          throw new Error("provider down");
        },
      })
    ).rejects.toThrow("provider down");
    expect(await ctx.detail(openingId)).toMatchObject({
      status: "analyzed",
      fitCheck: { outdated: true },
    });

    await ctx.openings.reanalyze({ userId: ctx.user.id, openingId });
    await ctx.analyze(openingId, fitScript(allMet));
    const after = (await ctx.detail(openingId)).fitCheck!;
    expect(after.outdated).toBe(false);
    expect(after.items.find((item) => item.term === "Terraform")).toMatchObject(
      {
        verdict: "met",
        gapQuestion: "About Terraform?",
        gapAnswer: "I wrote our modules.",
      }
    );
  });

  it("excludes the opening's company in the job preferences", async () => {
    const ctx = await setup();
    const openingId = await ctx.add();
    await ctx.analyze(openingId, fitScript(allMet));
    // Preferences the user is still writing, never published.
    const started = await ctx.profiles.getDraft({
      userId: ctx.user.id,
      language: "en-US",
      kind: "preferences",
    });
    await ctx.profiles.saveDraft({
      userId: ctx.user.id,
      markdown: started.markdown.replace(
        "## Excluded sectors",
        "## Excluded sectors\n\n- Tobacco"
      ),
      baseRevision: started.revision,
      kind: "preferences",
    });

    await ctx.openings.excludeCompany({
      userId: ctx.user.id,
      openingId,
      date: "2026-11-17",
      language: "en-US",
    });

    const draft = await ctx.profiles.getDraft({
      userId: ctx.user.id,
      language: "en-US",
      kind: "preferences",
    });
    expect(draft.markdown).toContain(
      "## Excluded companies\n\n- Globex (2026-11-17)"
    );
    expect(draft.markdown).toContain("- Tobacco");
    // Published too, so the next fit check counts it: the company alone,
    // not what the user hadn't published.
    expect(draft.publishedVersion?.number).toBe(1);
    const published = await ctx.profiles.getVersion({
      userId: ctx.user.id,
      profileVersionId: draft.publishedVersion!.id,
      kind: "preferences",
    });
    expect(published.markdown).toContain("- Globex (2026-11-17)");
    expect(published.markdown).not.toContain("Tobacco");
    // The check already made is now outdated, and the next one is low.
    expect((await ctx.detail(openingId)).fitCheck?.outdated).toBe(true);
    const next = await ctx.add();
    await ctx.analyze(next, fitScript(allMet));
    expect((await ctx.detail(next)).fitCheck!.band).toBe("low");
  });

  it("turns gaps into questions and stores the user's answer", async () => {
    const ctx = await setup();
    const openingId = await ctx.add();
    const script = fitScript((terms) => ({
      items: terms.map((term) => ({
        term_id: term.termId,
        verdict: "gap",
        passage_ids: [],
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

    const detail = await ctx.detail(openingId);
    const terraform = detail.fitCheck!.items.find(
      (item) => item.term === "Terraform"
    )!;
    expect(terraform.gapQuestion).toBe(
      "Do you have experience with Terraform?"
    );
    // Nothing is asked where the user already answered: what the profile
    // says is lacking (Spark, studied) and what the preferences settle.
    const asked = detail.fitCheck!.items.filter((item) => item.gapQuestion);
    expect(asked.map((item) => item.term)).not.toContain("Spark");
    expect(asked.map((item) => item.category)).not.toContain("work_model");

    await ctx.openings.answerGapQuestion({
      userId: ctx.user.id,
      fitCheckItemId: terraform.id,
      answer: "Yes: I wrote our Terraform modules in 2024.",
    });
    const after = await ctx.detail(openingId);
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
      rejectionReason: "not_an_opening",
      fitCheck: null,
    });
  });

  it("reads a link with the isolated reader, or asks for the text", async () => {
    const ctx = await setup();
    const { openingId: blocked } = await ctx.openings.createFromLink({
      userId: ctx.user.id,
      url: "https://jobs.example.com/1",
    });
    await ctx.analyze(blocked, fitScript(allMet), async () => ({
      ok: false,
      reason: "needs_paste",
    }));
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
    await ctx.analyze(read, fitScript(allMet), async () => ({
      ok: true,
      text: posting,
    }));
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

  it("refuses another user's opening", async () => {
    const ctx = await setup();
    const { openingId } = await ctx.openings.createFromText({
      userId: ctx.user.id,
      description: posting,
    });
    const grace = await createTestUser("grace@example.com");
    await new CareerService(ctx.db).getOrCreateProfile({
      userId: grace.id,
      defaultLanguage: "en-US",
    });

    await expect(
      ctx.openings.get({ userId: grace.id, openingId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
