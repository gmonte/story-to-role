import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAiClient } from "@repo/api/domains/ai/ai-client";
import { CareerService } from "@repo/api/domains/career/career-service";
import { creditCap } from "@repo/api/domains/credits/credit-pricing";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadNeverIncludeFilter } from "@repo/api/domains/profile/rules/load-never-include-filter";
import { ProfileService } from "@repo/api/domains/profile/profile-service";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { loadDocumentAgentContext } from "../agent/document-agent-context";
import { ChangesService } from "../changes/changes-service";
import { proposeChange } from "../changes/propose-change";
import type { CoverageReviewDraft } from "../coverage-review/coverage-review";
import { DocumentsService } from "../documents-service";
import { loadCareerContext } from "../generation/load-career-context";
import type { DocumentContent } from "../schemas/document-content";
import { defaultGenerationSettings } from "../schemas/generation-settings";
import type { LinkedinContent } from "../schemas/linkedin-content";
import { assembleLinkedin, runGenerateLinkedin } from "./run-generate-linkedin";
import type { LinkedinDraft } from "./linkedin-prompts";
import { LinkedinService } from "./linkedin-service";

vi.mock("@repo/common/env/web.env", () => ({
  env: { ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}` },
}));

const profileMarkdown = `# Profile

## Professional identity

- Professional name: Ada Lovelace
- Platform engineer and tech lead.

## Contact (only what may appear on a resume)

- Professional email: ada@example.com

## Experience (most recent first)

### Globex — Tech Lead (2021-03 to present)

- Responsibilities: Led a team of 5 engineers.
- Tools: Kubernetes, Terraform
- Results:
  - Cut deploy time by 40% with Kubernetes [measured: CI dashboard].
  - Cut cloud costs by 30% [estimated].
  - Moved the billing platform of Initrode [no number].

### Acme — Developer (2001-01 to 2004-02)

- Tools: Perl
- Results:
  - Built the order services in Perl [no number].

## Projects

### Side Product (2024-01 to present)

- Role: Founder
- Results:
  - Shipped the first version to 120 testers [measured: spreadsheet].

## Education

- BSc in Computer Science — State University — completed in 2010-12

## Certifications

- Certified Kubernetes Administrator — CNCF — 2023-05 — valid

## Competencies

- I master: Kubernetes, Terraform
- Studied, without professional experience: Rust

## Languages

- English — C1
- Portuguese — native
- Klingon — conversação

## Known gaps

- Go in production.

## Communication rules

- Never include: Initrode
`;

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const profile = await new CareerService(db).getOrCreateProfile({
    userId: user.id,
    defaultLanguage: "en-US",
  });
  const cipher = await getUserCipher(db, user.id);
  const trigger = {
    trigger: vi.fn(async () => ({ runId: "run", accessToken: "t" })),
  };
  const tasks = new TasksService(db, trigger);
  const profiles = new ProfileService(db, tasks);
  const draft = await profiles.getDraft({ userId: user.id, language: "en-US" });
  const { revision } = await profiles.saveDraft({
    userId: user.id,
    markdown: profileMarkdown,
    baseRevision: draft.revision,
  });
  await profiles.publish({ userId: user.id, baseRevision: revision });
  const filter = await loadNeverIncludeFilter({
    db,
    cipher,
    profileId: profile.id,
  });
  const context = await loadCareerContext({
    db,
    cipher,
    profileId: profile.id,
    filter,
  });
  const lineOf = (text: string) =>
    context.evidence.find((row) => row.text.includes(text))!;
  const globex = context.positions.find((p) => p.employer === "Globex")!;
  const acme = context.positions.find((p) => p.employer === "Acme")!;
  const service = new LinkedinService(db, tasks);
  const documents = new DocumentsService(db, tasks);
  const request = {
    userId: user.id,
    language: "en-US" as const,
    writingLevel: "standard" as const,
    tone: "direct" as const,
  };

  /** Runs a generation's task with a scripted writer and coverage review. */
  async function run(
    generationId: string,
    writer: LinkedinDraft,
    coverage: CoverageReviewDraft = {
      strong: [],
      partial: [],
      gaps: [],
      inconsistencies: [],
      suggestions: [],
    }
  ) {
    const fake = fakeProviderPackage({
      object: ({ system }) =>
        system.startsWith("You audit") ? coverage : writer,
    });
    await runGenerateLinkedin({
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
      today: "2026-06",
    });
    return fake;
  }

  async function generate(
    writer: LinkedinDraft,
    coverage?: CoverageReviewDraft
  ) {
    const created = await service.generate(request);
    const fake = await run(created.generationId, writer, coverage);
    const view = await documents.libraryDocument({
      userId: user.id,
      documentId: created.documentId,
    });
    return { ...created, fake, view, version: view.versions[0] };
  }

  return {
    db,
    user,
    profile,
    context,
    lineOf,
    globex,
    acme,
    service,
    documents,
    tasks,
    request,
    run,
    generate,
    trigger,
  };
}

const linkedinOf = (content: DocumentContent): LinkedinContent => {
  if (content.kind !== "linkedin") throw new Error("not LinkedIn text");
  return content;
};

describe("LinkedIn text", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  const writer = (ctx: Awaited<ReturnType<typeof setup>>): LinkedinDraft => {
    const deploy = ctx.lineOf("Cut deploy time by 40%");
    const team = ctx.lineOf("Led a team of 5 engineers");
    return {
      headlines: [],
      education: [],
      about: {
        paragraphs: [
          "I lead platform teams.",
          "I cut deploy time by 40% with Kubernetes.",
        ],
        evidence_ids: [deploy.id, team.id],
      },
      projects: [],
      experience: [
        {
          position_id: ctx.globex.id,
          bullets: [
            { text: "Cut deploy time by 40%.", evidence_ids: [deploy.id] },
            // The profile marks this figure estimated: refused.
            {
              text: "Cut cloud costs by 30%.",
              evidence_ids: [ctx.lineOf("Cut cloud costs").id],
            },
            // Cites nothing.
            { text: "Won an award.", evidence_ids: [] },
            // Studied only, never used at work.
            { text: "Wrote services in Rust.", evidence_ids: [team.id] },
            { text: "Led a team of 5 engineers.", evidence_ids: [team.id] },
          ],
        },
        {
          // Very old: LinkedIn writes it like any other position.
          position_id: ctx.acme.id,
          bullets: [
            {
              text: "Built the order services in Perl.",
              evidence_ids: [ctx.lineOf("order services").id],
            },
          ],
        },
      ],
    };
  };

  it("writes from the frozen profile only: locked facts by code, figures only when measured", async () => {
    const ctx = await setup();
    const { version, view, fake, documentId } = await ctx.generate(writer(ctx));
    expect(view.kind).toBe("linkedin");
    const content = linkedinOf(version.content);
    // The About keeps its paragraphs; the figure is the measured one.
    expect(content.about.text).toBe(
      "I lead platform teams.\n\nI cut deploy time by 40% with Kubernetes."
    );
    // Locked facts are the profile's; every position is written, the very
    // old one too.
    expect(content.experiences).toMatchObject([
      {
        positionId: ctx.globex.id,
        employer: "Globex",
        title: "Tech Lead",
        startDate: "2021-03",
        endDate: null,
      },
      {
        positionId: ctx.acme.id,
        employer: "Acme",
        startDate: "2001-01",
        lines: [{ text: "Built the order services in Perl." }],
      },
    ]);
    // No finding for a very old position, and the writer writes them all.
    expect(
      version.coverage?.findings.map((finding) => finding.code)
    ).not.toContain("veryOld");
    expect(fake.generateObject.mock.calls[0][0].system).toContain(
      "every position"
    );
    // Refused: the estimated figure, no evidence, a studied competency.
    expect(content.experiences[0].lines.map((line) => line.text)).toEqual([
      "Cut deploy time by 40%.",
      "Led a team of 5 engineers.",
    ]);
    // The writer and the coverage review: two calls, the review general.
    expect(fake.generateObject).toHaveBeenCalledTimes(2);
    // Experiences and projects in 3 to 4 bullets, the resume's format.
    expect(fake.generateObject.mock.calls[0][0].system).toContain(
      "3 to 4 bullets"
    );
    expect(fake.generateObject.mock.calls[0][0].system).toContain(
      "Bullet format"
    );
    // The About's rules: identity, proof, keywords, no filler.
    expect(fake.generateObject.mock.calls[0][0].system).toContain(
      "About format"
    );
    expect(fake.generateObject.mock.calls[0][0].system).toContain(
      "2,600 characters"
    );
    expect(fake.generateObject.mock.calls[1][0].system).toContain(
      "Career as the profile states it"
    );
    expect(version.coverage?.findings).toEqual([]);
    expect(version.coverage?.review?.sources.purpose).toEqual({
      kind: "focus",
      focus: "Career as the profile states it",
    });
    expect(version.coverage?.current).toBe(true);
    // The snapshot froze the published profile version.
    expect(version.snapshot.origin).toBe("generated");
    expect(version.pdf.ready).toBe(false);
    expect(documentId).toBe(view.id);
    // One document per user: generating again is a new snapshot of it.
    const again = await ctx.service.generate(ctx.request);
    expect(again.documentId).toBe(documentId);
    await ctx.run(again.generationId, writer(ctx));
    const [next] = (
      await ctx.documents.libraryDocument({
        userId: ctx.user.id,
        documentId,
      })
    ).versions;
    expect(next.snapshot.sequence).toBe(2);
    expect(next.id).toBe(version.id);
    // Charged like a cover letter.
    expect(creditCap("generate_document", { documentKind: "linkedin" })).toBe(
      creditCap("generate_document", { documentKind: "cover_letter" })
    );
  });

  it("asks before copying while a figure the profile doesn't mark measured is in the text, and keeps locked facts", async () => {
    const ctx = await setup();
    const { version, documentId } = await ctx.generate(writer(ctx));
    const content = linkedinOf(version.content);

    // Copy works while there are no findings.
    await expect(
      ctx.service.sectionText({
        userId: ctx.user.id,
        versionId: version.id,
        section: "about",
      })
    ).resolves.toEqual({
      text: "I lead platform teams.\n\nI cut deploy time by 40% with Kubernetes.",
    });
    await expect(
      ctx.service.sectionText({
        userId: ctx.user.id,
        versionId: version.id,
        section: ctx.globex.id,
      })
    ).resolves.toEqual({
      text: "• Cut deploy time by 40%.\n• Led a team of 5 engineers.",
    });

    // An edit adds a figure the profile doesn't mark measured.
    const [first, ...rest] = content.experiences[0].lines;
    await ctx.documents.saveEdit({
      userId: ctx.user.id,
      versionId: version.id,
      baseSnapshotId: version.snapshot.id,
      content: {
        ...content,
        experiences: [
          {
            ...content.experiences[0],
            lines: [{ ...first, text: "Cut costs by 30%." }, ...rest],
          },
        ],
      },
    });
    const [edited] = (
      await ctx.documents.libraryDocument({
        userId: ctx.user.id,
        documentId,
      })
    ).versions;
    expect(edited.coverage?.findings).toMatchObject([
      { code: "notInProfile" },
      { code: "figure", params: { figures: "30%" } },
    ]);
    expect(linkedinOf(edited.content).experiences[0].lines[0].origin).toEqual({
      kind: "manual",
    });
    for (const section of ["about", ctx.globex.id]) {
      await expect(
        ctx.service.sectionText({
          userId: ctx.user.id,
          versionId: version.id,
          section,
        })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    }
    // Confirmed, the text is copied with the figure in it.
    await expect(
      ctx.service.sectionText({
        userId: ctx.user.id,
        versionId: version.id,
        section: ctx.globex.id,
        acknowledgeWarnings: true,
      })
    ).resolves.toEqual({
      text: "• Cut costs by 30%.\n• Led a team of 5 engineers.",
    });

    // A locked fact is never edited here.
    await expect(
      ctx.documents.saveEdit({
        userId: ctx.user.id,
        versionId: version.id,
        baseSnapshotId: edited.snapshot.id,
        content: {
          ...linkedinOf(edited.content),
          experiences: [
            { ...content.experiences[0], employer: "Initech", lines: [] },
          ],
        },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Four bullets on an experience is LinkedIn's count, not a finding.
    const four = await ctx.documents.saveEdit({
      userId: ctx.user.id,
      versionId: version.id,
      baseSnapshotId: edited.snapshot.id,
      content: {
        ...linkedinOf(edited.content),
        experiences: [
          {
            ...content.experiences[0],
            lines: [
              ...content.experiences[0].lines,
              ...content.experiences[0].lines.map((line, index) => ({
                ...line,
                id: `extra-${index}`,
              })),
            ],
          },
        ],
      },
    });
    expect(four).toBeTruthy();
    const [fourBullets] = (
      await ctx.documents.libraryDocument({
        userId: ctx.user.id,
        documentId,
      })
    ).versions;
    expect(linkedinOf(fourBullets.content).experiences[0].lines).toHaveLength(
      4
    );
    expect(
      fourBullets.coverage?.findings.map((finding) => finding.code)
    ).not.toContain("bulletCount");
    await ctx.documents.undo({ userId: ctx.user.id, versionId: version.id });

    // Undoing the edit brings the copy back.
    await ctx.documents.undo({ userId: ctx.user.id, versionId: version.id });
    await expect(
      ctx.service.sectionText({
        userId: ctx.user.id,
        versionId: version.id,
        section: "about",
      })
    ).resolves.toMatchObject({
      text: expect.stringContaining("platform") as string,
    });
  });

  it("copies the headline, an education's description, the certifications and the languages, and checks the headline", async () => {
    const ctx = await setup();
    const team = ctx.lineOf("Led a team of 5 engineers");
    const education = ctx.context.credentials.find(
      (row) => row.kind === "education"
    )!;
    const { version, documentId } = await ctx.generate({
      ...writer(ctx),
      headlines: [
        { text: "Tech Lead | Platform teams", evidence_ids: [team.id] },
        { text: "Platform engineer and team lead", evidence_ids: [team.id] },
      ],
      education: [
        {
          credential_id: education.id,
          description: { text: "Led a study group.", evidence_ids: [team.id] },
        },
      ],
    });
    const copy = (section: string, acknowledgeWarnings?: boolean) =>
      ctx.service.sectionText({
        userId: ctx.user.id,
        versionId: version.id,
        section,
        acknowledgeWarnings,
      });
    expect(version.coverage?.findings).toEqual([]);
    await expect(copy("headline")).resolves.toEqual({
      text: "Tech Lead | Platform teams",
    });
    await expect(copy(education.id)).resolves.toEqual({
      text: "Led a study group.",
    });
    await expect(copy("certifications")).resolves.toEqual({
      text: "Certified Kubernetes Administrator — CNCF — 2023-05 — valid",
    });
    await expect(copy("languages")).resolves.toEqual({
      text: "English — Full professional proficiency\nPortuguese — Native or bilingual proficiency\nKlingon — conversação",
    });

    // Choosing another option and giving it an unmarked figure is pointed
    // out like any line.
    const content = linkedinOf(version.content);
    await ctx.documents.saveEdit({
      userId: ctx.user.id,
      versionId: version.id,
      baseSnapshotId: version.snapshot.id,
      content: {
        ...content,
        headline: {
          ...content.headlineOptions[1],
          text: "Platform engineer who cut costs by 30%",
        },
      },
    });
    const [edited] = (
      await ctx.documents.libraryDocument({
        userId: ctx.user.id,
        documentId,
      })
    ).versions;
    expect(edited.coverage?.findings).toContainEqual(
      expect.objectContaining({ code: "figure" })
    );
    await expect(copy("headline")).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    await expect(copy("headline", true)).resolves.toEqual({
      text: "Platform engineer who cut costs by 30%",
    });
  });

  it("goes step by step: starts with what code prints, writes each section alone, and finishes with a coverage review", async () => {
    const ctx = await setup();
    const team = ctx.lineOf("Led a team of 5 engineers");
    const triggered = ctx.trigger.trigger.mock.calls.length;
    const started = await ctx.service.start(ctx.request);
    const latest = async () =>
      (
        await ctx.documents.libraryDocument({
          userId: ctx.user.id,
          documentId: started.documentId,
        })
      ).versions[0];
    const first = await latest();
    const content = linkedinOf(first.content);
    // Free and without AI: what code prints, every position with no
    // bullets, the very old one too.
    expect(ctx.trigger.trigger).toHaveBeenCalledTimes(triggered);
    expect(first.id).toBe(started.versionId);
    expect(content.headline).toBeNull();
    expect(content.about.text).toBe("");
    expect(
      content.experiences.map((entry) => [entry.employer, entry.lines.length])
    ).toEqual([
      ["Globex", 0],
      ["Acme", 0],
    ]);
    expect(content.projects.map((entry) => entry.name)).toEqual([
      "Side Product",
    ]);
    expect(content.education).toMatchObject([
      { title: "BSc in Computer Science", description: null },
    ]);
    expect(content.certifications).toHaveLength(1);
    expect(content.languages.map((row) => row.proficiency)).toEqual([
      "full_professional",
      "native_or_bilingual",
      null,
    ]);
    expect(first.coverage?.review ?? null).toBeNull();
    // Starting again in that language keeps the text as it is.
    const again = await ctx.service.start(ctx.request);
    expect(again.versionId).toBe(started.versionId);
    expect((await latest()).snapshot.sequence).toBe(1);

    // The Experiences step writes every position, and nothing else.
    const experiences = await ctx.service.regenerateSection({
      userId: ctx.user.id,
      versionId: started.versionId,
      section: "experiences",
    });
    const fake = await ctx.run(experiences.generationId, writer(ctx));
    expect(fake.generateObject).toHaveBeenCalledTimes(1);
    expect(fake.generateObject.mock.calls[0][0].system).toContain(
      "Write only the experience text of every position"
    );
    const written = linkedinOf((await latest()).content);
    expect(written.experiences.map((entry) => entry.lines.length)).toEqual([
      2, 1,
    ]);
    expect(written.about.text).toBe("");
    expect(written.headline).toBeNull();

    // The About step writes the About alone.
    const about = await ctx.service.regenerateSection({
      userId: ctx.user.id,
      versionId: started.versionId,
      section: "about",
    });
    await ctx.run(about.generationId, {
      ...writer(ctx),
      about: {
        paragraphs: ["I lead platform teams."],
        evidence_ids: [team.id],
      },
    });
    const withAbout = await latest();
    expect(linkedinOf(withAbout.content).about.text).toBe(
      "I lead platform teams."
    );
    expect(
      linkedinOf(withAbout.content).experiences.map((e) => e.lines.length)
    ).toEqual([2, 1]);

    // Finish: the coverage review of the text as it is, on its latest
    // snapshot, priced as a review.
    const finish = await ctx.service.review({
      userId: ctx.user.id,
      versionId: started.versionId,
    });
    const reviewer = await ctx.run(finish.generationId, writer(ctx));
    expect(reviewer.generateObject).toHaveBeenCalledTimes(1);
    expect(reviewer.generateObject.mock.calls[0][0].system).toMatch(
      /^You audit/
    );
    const reviewed = await latest();
    expect(reviewed.snapshot.id).toBe(withAbout.snapshot.id);
    expect(reviewed.coverage?.review).toBeTruthy();
    expect(reviewed.coverage?.current).toBe(true);
    expect(
      creditCap("generate_document", {
        documentKind: "linkedin",
        linkedinReview: true,
      })
    ).toBe(creditCap("review_document"));
  });

  it("redoes one section as an adjustment, keeping the other sections and the user's edits", async () => {
    const ctx = await setup();
    const deploy = ctx.lineOf("Cut deploy time by 40%");
    const team = ctx.lineOf("Led a team of 5 engineers");
    const { version, documentId } = await ctx.generate({
      ...writer(ctx),
      headlines: [{ text: "Tech Lead | Platform", evidence_ids: [team.id] }],
    });
    const content = linkedinOf(version.content);
    // The user rewords the About.
    await ctx.documents.saveEdit({
      userId: ctx.user.id,
      versionId: version.id,
      baseSnapshotId: version.snapshot.id,
      content: {
        ...content,
        about: { ...content.about, text: "I lead platform teams, my way." },
      },
    });
    const latest = async () =>
      (await ctx.documents.libraryDocument({ userId: ctx.user.id, documentId }))
        .versions[0];

    const redo = await ctx.service.regenerateSection({
      userId: ctx.user.id,
      versionId: version.id,
      section: ctx.globex.id,
    });
    const fake = await ctx.run(redo.generationId, {
      ...writer(ctx),
      headlines: [{ text: "Another headline", evidence_ids: [team.id] }],
      about: { paragraphs: ["Something else."], evidence_ids: [team.id] },
      experience: [
        {
          position_id: ctx.globex.id,
          bullets: [
            {
              text: "Led 5 engineers and cut deploy time by 40%.",
              evidence_ids: [team.id, deploy.id],
            },
          ],
        },
      ],
    });
    const redone = await latest();
    const next = linkedinOf(redone.content);
    expect(next.experiences[0].lines.map((line) => line.text)).toEqual([
      "Led 5 engineers and cut deploy time by 40%.",
    ]);
    expect(next.about.text).toBe("I lead platform teams, my way.");
    expect(next.headline?.text).toBe("Tech Lead | Platform");
    expect(redone.snapshot).toMatchObject({ sequence: 3, origin: "generated" });
    // One writer call asked for that section only; no coverage review.
    expect(fake.generateObject).toHaveBeenCalledTimes(1);
    expect(fake.generateObject.mock.calls[0][0].system).toContain(
      "Write only the experience text of the position"
    );

    // Undo brings the section back as it was.
    await ctx.documents.undo({ userId: ctx.user.id, versionId: version.id });
    expect(
      linkedinOf((await latest()).content).experiences[0].lines.map(
        (line) => line.text
      )
    ).toEqual(["Cut deploy time by 40%.", "Led a team of 5 engineers."]);

    // The headline options are redone together; a section the text
    // doesn't have, or a credential code prints, can't be.
    const headline = await ctx.service.regenerateSection({
      userId: ctx.user.id,
      versionId: version.id,
      section: "headline",
    });
    await ctx.run(headline.generationId, {
      ...writer(ctx),
      headlines: [
        { text: "Platform Tech Lead", evidence_ids: [team.id] },
        { text: "Engineering lead", evidence_ids: [team.id] },
      ],
    });
    const withHeadlines = linkedinOf((await latest()).content);
    expect(withHeadlines.headlineOptions.map((line) => line.text)).toEqual([
      "Platform Tech Lead",
      "Engineering lead",
    ]);
    expect(withHeadlines.headline?.text).toBe("Platform Tech Lead");
    expect(withHeadlines.about.text).toBe("I lead platform teams, my way.");
    for (const section of ["languages", "no-such-section"]) {
      await expect(
        ctx.service.regenerateSection({
          userId: ctx.user.id,
          versionId: version.id,
          section,
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }

    // Priced as an adjustment.
    expect(
      creditCap("generate_document", {
        documentKind: "linkedin",
        linkedinSection: true,
      })
    ).toBe(creditCap("adapt_document"));
  });

  it("lets the document agent suggest changes to the LinkedIn text, applied on Accept", async () => {
    const ctx = await setup();
    const team = ctx.lineOf("Led a team of 5 engineers");
    const { version, documentId } = await ctx.generate({
      ...writer(ctx),
      headlines: [{ text: "Tech Lead | Platform", evidence_ids: [team.id] }],
    });
    const cipher = await getUserCipher(ctx.db, ctx.user.id);
    const agent = await loadDocumentAgentContext({
      db: ctx.db,
      cipher,
      userId: ctx.user.id,
      documentId,
    });
    expect(agent?.kind).toBe("linkedin");
    expect(agent?.documentText).toContain("[part: headline]");
    expect(agent?.documentText).toContain("[part: about]");
    expect(agent?.documentText).toContain(
      `[part: experience:${ctx.globex.id}]`
    );

    const propose = (change: { part: string; find: string; replace: string }) =>
      proposeChange({
        db: ctx.db,
        cipher,
        versionId: version.id,
        snapshotId: version.snapshot.id,
        content: agent!.content,
        origin: "document_agent",
        change,
        reason: "More direct.",
        profilePassages: [team.text],
        evidence: agent!.evidence,
        profileText: agent!.profileText,
        sources: [],
      });
    await expect(
      propose({
        part: `experience:${ctx.globex.id}`,
        find: "Led a team of 5 engineers.",
        replace: "Led a platform team of 5 engineers.",
      })
    ).resolves.toMatchObject({ ok: true });
    await expect(
      propose({
        part: "about",
        find: "I lead platform teams.",
        replace: "I lead platform teams that ship.",
      })
    ).resolves.toMatchObject({ ok: true });
    await expect(
      propose({
        part: "headline",
        find: "Tech Lead | Platform",
        replace: "Platform Tech Lead",
      })
    ).resolves.toMatchObject({ ok: true });
    // The certifications and languages stay the profile's.
    await expect(
      propose({ part: "languages", find: "English", replace: "French" })
    ).resolves.toMatchObject({ ok: false, refusal: { kind: "locked" } });

    const changes = new ChangesService(ctx.db);
    const listed = await changes.listChanges({
      userId: ctx.user.id,
      versionId: version.id,
    });
    expect(listed.map((change) => change.stale)).toEqual([false, false, false]);
    await changes.acceptChanges({
      userId: ctx.user.id,
      versionId: version.id,
      baseSnapshotId: version.snapshot.id,
    });
    const content = linkedinOf(
      (await ctx.documents.libraryDocument({ userId: ctx.user.id, documentId }))
        .versions[0].content
    );
    expect(content.experiences[0].lines.map((line) => line.text)).toEqual([
      "Cut deploy time by 40%.",
      "Led a platform team of 5 engineers.",
    ]);
    expect(content.about.text).toBe(
      "I lead platform teams that ship.\n\nI cut deploy time by 40% with Kubernetes."
    );
    expect(content.headline?.text).toBe("Platform Tech Lead");
    expect(content.headline?.origin).toEqual({
      kind: "evidence",
      evidenceIds: [team.id],
    });
  });

  it("keeps it to its owner and refuses what isn't LinkedIn text", async () => {
    const ctx = await setup();
    const { version, documentId } = await ctx.generate(writer(ctx));
    const other = await createTestUser("grace@example.com");
    await new CareerService(ctx.db).getOrCreateProfile({
      userId: other.id,
      defaultLanguage: "en-US",
    });
    await expect(
      ctx.service.sectionText({
        userId: other.id,
        versionId: version.id,
        section: "about",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      ctx.documents.libraryDocument({ userId: other.id, documentId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      ctx.service.sectionText({
        userId: ctx.user.id,
        versionId: version.id,
        section: "no-such-position",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("writes the headline options and education descriptions by the summary's rules, and prints the credentials", async () => {
    const ctx = await setup();
    const deploy = ctx.lineOf("Cut deploy time by 40%");
    const team = ctx.lineOf("Led a team of 5 engineers");
    const education = ctx.context.credentials.find(
      (row) => row.kind === "education"
    )!;
    const { content, dropped } = assembleLinkedin({
      draft: {
        ...writer(ctx),
        headlines: [
          {
            text: "Tech Lead | Platform engineering with Kubernetes",
            evidence_ids: [team.id, deploy.id],
          },
          // An estimated figure, a line citing nothing and one too long.
          {
            text: "Tech Lead who cut cloud costs by 30%",
            evidence_ids: [ctx.lineOf("Cut cloud costs").id],
          },
          { text: "Visionary leader", evidence_ids: [] },
          { text: `Tech Lead ${"x".repeat(220)}`, evidence_ids: [team.id] },
        ],
        education: [
          {
            credential_id: education.id,
            description: {
              text: "Studied distributed systems.",
              evidence_ids: [deploy.id],
            },
          },
        ],
      },
      context: ctx.context,
      settings: defaultGenerationSettings,
      today: "2026-06",
    });

    // Only grounded options under 220 characters stay; the first is chosen.
    expect(content.headlineOptions.map((line) => line.text)).toEqual([
      "Tech Lead | Platform engineering with Kubernetes",
    ]);
    expect(content.headline).toEqual(content.headlineOptions[0]);
    expect(dropped.map((line) => line.reason)).toEqual(
      expect.arrayContaining(["unsupported_figure", "no_evidence", "too_long"])
    );

    // Credentials are printed by code, a description only with a source.
    expect(content.education).toMatchObject([
      {
        credentialId: education.id,
        title: "BSc in Computer Science",
        institution: "State University",
        endDate: "2010-12",
        description: { text: "Studied distributed systems." },
      },
    ]);
    expect(content.certifications).toMatchObject([
      {
        title: "Certified Kubernetes Administrator",
        institution: "CNCF",
        level: "valid",
        endDate: "2023-05",
      },
    ]);
    expect(
      content.languages.map((row) => [row.title, row.proficiency])
    ).toEqual([
      ["English", "full_professional"],
      ["Portuguese", "native_or_bilingual"],
      ["Klingon", null],
    ]);

    // An education with no description drafted, or none backed, has none.
    const bare = assembleLinkedin({
      draft: {
        ...writer(ctx),
        headlines: [],
        education: [
          {
            credential_id: education.id,
            description: { text: "Graduated with honours.", evidence_ids: [] },
          },
        ],
      },
      context: ctx.context,
      settings: defaultGenerationSettings,
      today: "2026-06",
    });
    expect(bare.content.education[0].description).toBeNull();
    expect(bare.content.headline).toBeNull();
  });

  it("applies the resume's assembly rules to LinkedIn content", async () => {
    const ctx = await setup();
    const deploy = ctx.lineOf("Cut deploy time by 40%");
    const team = ctx.lineOf("Led a team of 5 engineers");
    const assemble = (
      draft: LinkedinDraft,
      settings = defaultGenerationSettings
    ) =>
      assembleLinkedin({
        draft,
        context: ctx.context,
        settings,
        today: "2026-06",
      });
    const draft = writer(ctx);

    // 3 to 4 bullets per experience, whatever the resume's settings: the
    // first four kept are printed.
    const tools = ctx.lineOf("Tools: Kubernetes, Terraform");
    const many = assemble(
      {
        ...draft,
        experience: [
          {
            position_id: ctx.globex.id,
            bullets: [
              { text: "Led a team of 5 engineers.", evidence_ids: [team.id] },
              { text: "Cut deploy time by 40%.", evidence_ids: [deploy.id] },
              { text: "Ran Kubernetes clusters.", evidence_ids: [tools.id] },
              { text: "Wrote Terraform modules.", evidence_ids: [tools.id] },
              { text: "Mentored the team.", evidence_ids: [team.id] },
            ],
          },
        ],
      },
      { ...defaultGenerationSettings, bulletsRecent: 1, bulletsOlder: 0 }
    );
    expect(many.content.experiences[0].lines.map((l) => l.text)).toEqual([
      "Led a team of 5 engineers.",
      "Cut deploy time by 40%.",
      "Ran Kubernetes clusters.",
      "Wrote Terraform modules.",
    ]);
    const limited = assemble(draft);

    // Every position, whatever the very old setting says.
    const kept = assemble(draft, {
      ...defaultGenerationSettings,
      veryOld: "leave_out",
    });
    expect(kept.content.experiences.map((entry) => entry.employer)).toEqual([
      "Globex",
      "Acme",
    ]);
    expect(kept.content.experiences[1]).toMatchObject({
      positionId: ctx.acme.id,
      startDate: "2001-01",
    });

    // Refusals are reported with their reason.
    expect(limited.dropped.map((line) => line.reason).sort()).toEqual(
      expect.arrayContaining([
        "unsupported_figure",
        "no_evidence",
        "studied_only",
      ])
    );

    // An About that cites nothing, or carries an unmarked figure, is empty.
    expect(
      assemble({
        ...draft,
        about: { paragraphs: ["I cut costs by 30%."], evidence_ids: [team.id] },
      }).content.about.text
    ).toBe("");
    expect(
      assemble({
        ...draft,
        about: { paragraphs: ["Hello."], evidence_ids: [] },
      }).content.about.text
    ).toBe("");

    // A project goes after the experiences, written by the same rules.
    const project = ctx.context.projects[0];
    const testers = ctx.lineOf("120 testers");
    const withProject = assemble({
      ...draft,
      projects: [
        {
          project_id: project.id,
          bullets: [
            { text: "Shipped it to 120 testers.", evidence_ids: [testers.id] },
            { text: "Shipped it to 200 testers.", evidence_ids: [testers.id] },
          ],
        },
      ],
    });
    expect(withProject.content.projects).toMatchObject([
      {
        projectId: project.id,
        name: "Side Product",
        role: "Founder",
        startDate: "2024-01",
        endDate: null,
        lines: [{ text: "Shipped it to 120 testers." }],
      },
    ]);
    expect(withProject.dropped).toContainEqual({
      text: "Shipped it to 200 testers.",
      reason: "unsupported_figure",
    });

    // Lines citing another position's evidence are refused.
    expect(
      assemble({
        ...draft,
        about: draft.about,
        projects: [],
        experience: [
          {
            position_id: ctx.acme.id,
            bullets: [{ text: "Led a team.", evidence_ids: [deploy.id] }],
          },
        ],
      }).content.experiences
    ).toEqual([]);
  });
});
