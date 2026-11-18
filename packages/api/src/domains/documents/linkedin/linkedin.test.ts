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

## Certifications

## Competencies

- I master: Kubernetes, Terraform
- Studied, without professional experience: Rust

## Languages

- English — C1

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
          // Very old: the default rule leaves it out without a requirement.
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
    // Locked facts are the profile's, and the very old position is out.
    expect(content.experiences).toMatchObject([
      {
        positionId: ctx.globex.id,
        employer: "Globex",
        title: "Tech Lead",
        startDate: "2021-03",
        endDate: null,
      },
    ]);
    // Refused: the estimated figure, no evidence, a studied competency.
    expect(content.experiences[0].lines.map((line) => line.text)).toEqual([
      "Cut deploy time by 40%.",
      "Led a team of 5 engineers.",
    ]);
    // The writer and the coverage review: two calls, the review general.
    expect(fake.generateObject).toHaveBeenCalledTimes(2);
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

    // Bullets per the settings: a recent position keeps its first few.
    const limited = assemble(draft, {
      ...defaultGenerationSettings,
      bulletsRecent: 1,
    });
    expect(limited.content.experiences[0].lines).toHaveLength(1);

    // “Keep”: the very old position is written like an older one (1 bullet).
    const kept = assemble(draft, {
      ...defaultGenerationSettings,
      veryOld: "keep",
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
