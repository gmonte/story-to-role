import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createAiClient } from "@repo/api/domains/ai/ai-client";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { InterviewService } from "@repo/api/domains/interview/interview-service";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";
import { createLocalStorage } from "@repo/api/tools/storage/local-storage";

import { CareerRepository } from "../career-repository";
import { CareerService } from "../career-service";
import { DocumentsService } from "./documents-service";
import {
  isConcreteItem,
  runImportDocument,
  withoutAuthorNotes,
} from "./run-import-document";

vi.mock("@repo/common/env/web.env", () => ({
  env: { ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}` },
}));

const resumeA = `Ada Lovelace
Acme Corp — Senior Engineer — 2020-01 to 2023-06
Moved 12 services to Kubernetes, cutting deploys from 2 hours to 15 minutes.
Owned the on-call rotation and wrote the incident review process for the platform group.
Education: BSc Computer Science, Universidade de São Paulo.`;

const resumeB = `ADA LOVELACE, curriculum
ACME — Senior Engineer — 2019-11 to 2023-06
Led the platform team of 6 engineers and owned the CI pipeline end to end.
Introduced trunk-based development and feature flags across four product squads.
Languages: Portuguese (native), English (fluent).`;

const truthFile = `# My career facts
Acme — Senior Engineer — 2020-01 to 2023-06
Led the Phoenix migration for Banco X.
Cut monthly cloud costs by 30% [medido].
## DO NOT INCLUDE
❌ Banco X
❌ Names of people, colleagues and clients included`;

let rootDir: string;

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const trigger = {
    trigger: vi.fn(async () => ({ runId: "run", accessToken: "t" })),
  };
  const storage = createLocalStorage({ rootDir });
  const career = new CareerService(db);
  await career.getOrCreateProfile({
    userId: user.id,
    defaultLanguage: "en-US",
  });
  await career.acceptPrivacyNotice(user.id);
  const documents = new DocumentsService(
    db,
    new TasksService(db, trigger),
    storage
  );

  async function importFile(
    content: string,
    extraction: unknown,
    kind: "resume" | "truth_file" = "resume",
    isCareerDocument = true
  ) {
    const { sourceDocumentId } = await documents.upload({
      userId: user.id,
      fileName: kind === "resume" ? "resume.md" : "truth.md",
      mimeType: "text/markdown",
      bytes: Buffer.from(content),
    });
    const fake = fakeProviderPackage({
      object: (request: { purpose?: string; system: string }) =>
        request.system.startsWith("Decide whether")
          ? {
              is_career_document: isCareerDocument,
              // The kind is detected, never chosen at upload.
              has_confidentiality_rules: kind === "truth_file",
            }
          : extraction,
    });
    const cipher = await getUserCipher(db, user.id);
    await runImportDocument({
      db,
      cipher,
      storage,
      userId: user.id,
      sourceDocumentId,
      ai: createAiClient({
        db,
        userId: user.id,
        funding: "credits",
        providerPackage: fake.providerPackage,
      }),
    });
    return fake;
  }

  const timeline = () =>
    career.getTimeline({ userId: user.id, defaultLanguage: "en-US" });
  const upload = (fileName = "resume.md", content = resumeA) =>
    documents.upload({
      userId: user.id,
      fileName,
      mimeType: "text/markdown",
      bytes: Buffer.from(content),
    });
  return { db, user, career, documents, importFile, upload, timeline };
}

const acmeA = {
  employer: "Acme Corp",
  title: "Senior Engineer",
  start_date: "2020-01",
  end_date: "2023-06",
  facts: [
    {
      kind: "achievement",
      text: "Cut deploy time from 2 hours to 15 minutes",
      quote: "cutting deploys from 2 hours to 15 minutes",
    },
    // Not in the document: must be dropped.
    { kind: "metric", text: "Saved US$1M", quote: "saved one million dollars" },
  ],
};

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(tmpdir(), "import-"));
  await clearTestDatabase();
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

afterAll(async () => {
  await closeTestDatabase();
});

describe("document import", () => {
  it("refuses a file before the privacy notice is acknowledged", async () => {
    const { db, documents } = await setup();
    const newcomer = await createTestUser("grace@example.com");
    await new CareerService(db).getOrCreateProfile({
      userId: newcomer.id,
      defaultLanguage: "en-US",
    });

    await expect(
      documents.upload({
        userId: newcomer.id,
        fileName: "resume.md",
        mimeType: "text/markdown",
        bytes: Buffer.from(resumeA),
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("merges the same position from two resumes and shows the conflicting dates", async () => {
    const ctx = await setup();

    await ctx.importFile(resumeA, {
      positions: [acmeA],
      credentials: [
        {
          kind: "education",
          institution: "Universidade de São Paulo",
          title: "BSc Computer Science",
        },
      ],
      exclusions: [],
    });
    await ctx.importFile(resumeB, {
      positions: [
        {
          employer: "ACME",
          title: "Senior Engineer",
          start_date: "2019-11",
          end_date: "2023-06",
          facts: [
            {
              kind: "responsibility",
              text: "Led the platform team of 6 engineers",
              quote: "Led the platform team of 6 engineers",
            },
          ],
        },
      ],
      credentials: [],
      exclusions: [],
    });

    const timeline = await ctx.timeline();
    expect(timeline.positions).toHaveLength(1);
    expect(timeline.positions[0].conflicts).toEqual([
      expect.objectContaining({
        field: "startDate",
        options: ["2020-01", "2019-11"],
      }),
    ]);
    expect(timeline.documents.map((d) => d.status)).toEqual([
      "processed",
      "processed",
    ]);
    expect(timeline.credentials).toEqual([
      expect.objectContaining({
        title: "BSc Computer Science",
        approved: false,
      }),
    ]);
  });

  it("turns document facts into drafts traced to their passage, dropping invented ones", async () => {
    const ctx = await setup();
    await ctx.importFile(resumeA, {
      positions: [acmeA],
      credentials: [],
      exclusions: [],
    });

    const db = ctx.db;
    const interview = new InterviewService(
      db,
      new TasksService(db, { trigger: vi.fn() })
    );
    await ctx.career.acceptPrivacyNotice(ctx.user.id);
    const [position] = (await ctx.timeline()).positions;
    const { sessionId } = await interview.openSession({
      userId: ctx.user.id,
      positionId: position.id,
    });
    const session = await interview.getSession({
      userId: ctx.user.id,
      sessionId,
    });

    expect(session.drafts).toEqual([
      expect.objectContaining({
        text: "Cut deploy time from 2 hours to 15 minutes",
        quote: "cutting deploys from 2 hours to 15 minutes",
        fromDocument: true,
      }),
    ]);
  });

  it("approves every imported position without conflicts in one step", async () => {
    const ctx = await setup();
    await ctx.importFile(resumeA, {
      positions: [acmeA],
      credentials: [],
      exclusions: [],
    });
    const interview = new InterviewService(
      ctx.db,
      new TasksService(ctx.db, {
        trigger: vi.fn(async () => ({ runId: "r", accessToken: "t" })),
      })
    );

    const { approved } =
      await interview.approveImportedPositionsWithoutConflicts(ctx.user.id);

    expect(approved).toBe(1);
    const [position] = (await ctx.timeline()).positions;
    expect(position).toMatchObject({
      status: "approved",
      languages: ["en-US"],
      depth: { counts: { evidence: 1 } },
    });
  });

  it("refuses a file that is not a career document before extracting", async () => {
    const ctx = await setup();
    const fake = await ctx.importFile(
      "Lasagna recipe: layer pasta, sauce and cheese, then bake for 40 minutes at 200 degrees. Serves six people generously.".repeat(
        3
      ),
      {},
      "resume",
      false
    );

    expect(fake.generateObject).toHaveBeenCalledTimes(1);
    const [document] = (await ctx.timeline()).documents;
    expect(document).toMatchObject({
      status: "rejected",
      rejectionReason: "not_a_career_document",
    });
  });

  it("presets a truth file's do-not-include items to exclude", async () => {
    const ctx = await setup();
    await ctx.importFile(
      truthFile.repeat(2),
      {
        positions: [],
        credentials: [],
        exclusions: [{ kind: "client", original: "Banco X" }],
      },
      "truth_file"
    );

    const interview = new InterviewService(
      ctx.db,
      new TasksService(ctx.db, { trigger: vi.fn() })
    );
    expect(await interview.listSensitiveItems(ctx.user.id)).toEqual([
      expect.objectContaining({
        original: "Banco X",
        choice: "exclude",
        reviewed: false,
      }),
    ]);
  });

  it("applies a truth file's rules to names, never keeping a rule as an item", async () => {
    const ctx = await setup();
    await ctx.importFile(
      truthFile.repeat(2),
      {
        positions: [],
        credentials: [],
        exclusion_rules: ["Names of people, colleagues and clients included"],
        exclusions: [
          { kind: "client", original: "Banco X" },
          {
            kind: "person",
            original: "Names of people, colleagues and clients included",
          },
        ],
      },
      "truth_file"
    );

    const interview = new InterviewService(
      ctx.db,
      new TasksService(ctx.db, { trigger: vi.fn() })
    );
    expect(
      (await interview.listSensitiveItems(ctx.user.id)).map(
        (item) => item.original
      )
    ).toEqual(["Banco X"]);
  });

  it("leaves the author's notes out of a fact, in the user's language", async () => {
    const ctx = await setup();
    await ctx.importFile(
      truthFile,
      {
        language: "pt-BR",
        positions: [
          {
            employer: "Acme",
            title: "Senior Engineer",
            start_date: "2020-01",
            end_date: "2023-06",
            facts: [
              {
                kind: "metric",
                text: "Cut monthly cloud costs by 30% [medido]",
                quote: "Cut monthly cloud costs by 30% [medido]",
              },
            ],
          },
        ],
        credentials: [],
        exclusion_rules: [],
        exclusions: [],
      },
      "truth_file"
    );
    const interview = new InterviewService(
      ctx.db,
      new TasksService(ctx.db, { trigger: vi.fn() })
    );
    await ctx.career.acceptPrivacyNotice(ctx.user.id);
    const [position] = (await ctx.timeline()).positions;
    const { sessionId } = await interview.openSession({
      userId: ctx.user.id,
      positionId: position.id,
    });
    const session = await interview.getSession({
      userId: ctx.user.id,
      sessionId,
    });
    expect(session.drafts).toEqual([
      expect.objectContaining({
        text: "Cut monthly cloud costs by 30%",
        quote: "Cut monthly cloud costs by 30% [medido]",
        // The profile's interview language, not the document's.
        language: "en-US",
      }),
    ]);
  });
});

describe("sources", () => {
  it("detects a truth file from its confidentiality rules", async () => {
    const { importFile, timeline } = await setup();
    await importFile(
      truthFile.repeat(2),
      { positions: [], credentials: [], exclusions: [] },
      "truth_file"
    );

    const [document] = (await timeline()).documents;
    expect(document?.kind).toBe("truth_file");
  });

  it("keeps at most five sources; a removed one frees its slot", async () => {
    const { db, user, documents, upload, timeline } = await setup();
    for (let i = 0; i < 5; i++) await upload(`resume-${i}.md`);

    await expect(upload("resume-5.md")).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const [first] = (await timeline()).documents;
    // Not while its import still reads the file.
    await expect(
      documents.remove({ userId: user.id, sourceDocumentId: first.id })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await new CareerRepository(db).updateDocument(first.id, {
      status: "processed",
    });
    await documents.remove({
      userId: user.id,
      sourceDocumentId: first.id,
    });
    await expect(upload("resume-5.md")).resolves.toBeTruthy();
    expect((await timeline()).documents).toHaveLength(5);
  });

  it("previews a text source as plain text, only to its owner", async () => {
    const { db, user, documents, upload } = await setup();
    const { sourceDocumentId } = await upload(
      "notes.md",
      `${resumeA}\n<script>alert(1)</script>`
    );

    const preview = await documents.preview({
      userId: user.id,
      sourceDocumentId,
    });
    expect(preview).toEqual({
      type: "text",
      text: `${resumeA}\n<script>alert(1)</script>`,
    });

    const stranger = await createTestUser("eve@example.com");
    await new CareerService(db).getOrCreateProfile({
      userId: stranger.id,
      defaultLanguage: "en-US",
    });
    await expect(
      documents.preview({ userId: stranger.id, sourceDocumentId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      documents.renderPage({ userId: stranger.id, sourceDocumentId, page: 1 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a file whose content isn't what its name says", async () => {
    const { user, documents } = await setup();
    await expect(
      documents.upload({
        userId: user.id,
        fileName: "resume.pdf",
        mimeType: "application/pdf",
        bytes: Buffer.from(resumeA),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      documents.upload({
        userId: user.id,
        fileName: "resume.txt",
        mimeType: "text/plain",
        bytes: Buffer.from([0x41, 0x00, 0x42, 0xff]),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("import helpers", () => {
  it("strip author notes and keep everything else", () => {
    expect(withoutAuthorNotes("Reduziu custos em 30% [medido]")).toBe(
      "Reduziu custos em 30%"
    );
    expect(withoutAuthorNotes("Grew revenue 2x [Estimated, Q3]")).toBe(
      "Grew revenue 2x"
    );
    expect(withoutAuthorNotes("Wrote the [C++] engine")).toBe(
      "Wrote the [C++] engine"
    );
  });

  it("tell a concrete name from a rule's wording", () => {
    expect(isConcreteItem("Banco X")).toBe(true);
    expect(isConcreteItem("R$ 25.000")).toBe(true);
    expect(
      isConcreteItem("Names of people, colleagues and clients included")
    ).toBe(false);
    expect(isConcreteItem("nomes de colegas e clientes")).toBe(false);
    expect(
      isConcreteItem("salary and billing figures of any project or client")
    ).toBe(false);
  });
});
