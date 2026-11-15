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

import { CareerService } from "../career-service";
import { DocumentsService } from "./documents-service";
import { runImportDocument } from "./run-import-document";

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
## DO NOT INCLUDE
❌ Banco X`;

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
      kind,
      fileName: kind === "resume" ? "resume.md" : "truth.md",
      mimeType: "text/markdown",
      bytes: Buffer.from(content),
    });
    const fake = fakeProviderPackage({
      object: (request: { purpose?: string; system: string }) =>
        request.system.startsWith("Decide whether")
          ? { is_career_document: isCareerDocument }
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
  return { db, user, career, importFile, timeline };
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

describe("document import", () => {
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
});
