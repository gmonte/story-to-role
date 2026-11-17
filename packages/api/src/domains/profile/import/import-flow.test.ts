import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAiClient } from "@repo/api/domains/ai/ai-client";
import { CareerService } from "@repo/api/domains/career/career-service";
import { DocumentsService } from "@repo/api/domains/career/documents/documents-service";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";
import type { Storage } from "@repo/api/tools/storage/storage";

import { AgentChatService } from "../agent/agent-chat-service";
import {
  markImportSummariesSaid,
  pendingImportSummaries,
} from "../agent/import-summaries";
import { ProfileService } from "../profile-service";
import { ImportService } from "./import-service";
import { runImportSource } from "./run-import-source";

vi.mock("@repo/common/env/web.env", () => ({
  env: { ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}` },
}));

function memoryStorage(): Storage {
  const files = new Map<string, Buffer>();
  return {
    put: async (key, body) => {
      files.set(key, body);
    },
    get: async (key) => files.get(key) ?? null,
    delete: async (key) => {
      files.delete(key);
    },
  };
}

const profile = `# Perfil

## Identidade profissional

- Dev backend.

## Contato (só o que pode aparecer no currículo)

## Experiência (mais recente primeiro)

### Beta — Backend (2022-03 a atual)

- Tecnologias: Python
- Resultados:
  - Melhorei a performance [sem número].
- O que NÃO fiz: não liderei pessoas.

## Formação

## Certificações

## Competências

- Domino: Python

## Idiomas

## Lacunas conhecidas

## Regras de comunicação

- Nunca incluir:
`;

const resume = `Ana Souza, backend developer.

Beta (2022-03 to present), Backend Developer. Python and FastAPI.
Reduced the response time of the checkout by 60%.
Improved the performance of the system.

Gama (2019-02 to 2022-02), Junior Developer. Built sales reports in SQL
used daily by the commercial team.

Education: Information Systems, Example University, completed in 2018.
`.padEnd(260, " ");

type Change = {
  part: string;
  find: string;
  replace: string;
  reason?: string;
  evidence: string;
};

async function setup({ withDraft = true }: { withDraft?: boolean } = {}) {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const storage = memoryStorage();
  const career = new CareerService(db);
  await career.getOrCreateProfile({
    userId: user.id,
    defaultLanguage: "pt-BR",
  });
  await career.acceptPrivacyNotice(user.id);
  const trigger = {
    trigger: vi.fn(async () => ({ runId: "run", accessToken: "token" })),
  };
  const tasks = new TasksService(db, trigger);
  const profiles = new ProfileService(db, tasks);
  if (withDraft) {
    await profiles.saveDraft({
      userId: user.id,
      markdown: profile,
      baseRevision: 0,
    });
  }
  const upload = async (text = resume, fileName = "cv.txt") =>
    (
      await new DocumentsService(db, storage).upload({
        userId: user.id,
        fileName,
        mimeType: "text/plain",
        bytes: Buffer.from(text),
      })
    ).sourceDocumentId;

  /** Runs the import as its task would, the model answering `changes`. */
  async function run(
    sourceDocumentId: string,
    changes: Change[],
    check = { is_career_document: true, has_confidentiality_rules: false }
  ) {
    const { providerPackage } = fakeProviderPackage({
      object: ({ system }) =>
        system.startsWith("Decide whether")
          ? check
          : {
              changes: changes.map((change) => ({ reason: "r", ...change })),
              missing: "Falta dizer o que você não fez na Gama.",
            },
    });
    return runImportSource({
      db,
      ai: createAiClient({
        db,
        userId: user.id,
        funding: "credits",
        providerPackage,
      }),
      cipher: await getUserCipher(db, user.id),
      storage,
      userId: user.id,
      sourceDocumentId,
    });
  }

  const timeline = () =>
    career.getTimeline({ userId: user.id, defaultLanguage: "pt-BR" });
  const suggestions = () => profiles.listSuggestions(user.id);
  return { db, user, tasks, trigger, upload, run, timeline, suggestions };
}

describe("importing a file into the profile", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("proposes what the profile lacks, and nothing it already says", async () => {
    const ctx = await setup();
    const source = await ctx.upload();
    await ctx.run(source, [
      // New: a tool the file states.
      {
        part: "experience:beta — backend",
        find: "- Tecnologias: Python",
        replace: "- Tecnologias: Python, FastAPI",
        evidence: "Python and FastAPI",
      },
      // Already there, restated by the model: nothing to add.
      {
        part: "experience:beta — backend",
        find: "",
        replace: "- O que NÃO fiz: não liderei pessoas.",
        evidence: "Backend Developer",
      },
      {
        part: "competencies",
        find: "- Domino: Python",
        replace: "- Domino: Python",
        evidence: "Python and FastAPI",
      },
    ]);
    const waiting = await ctx.suggestions();
    expect(waiting.map((suggestion) => suggestion.replace)).toEqual([
      "- Tecnologias: Python, FastAPI",
    ]);
    expect(waiting[0].origin).toBe("import");
  });

  it("brings figures in as “a confirmar”, and none the file doesn't state", async () => {
    const ctx = await setup();
    const source = await ctx.upload();
    await ctx.run(source, [
      {
        part: "experience:beta — backend",
        find: "  - Melhorei a performance [sem número].",
        replace:
          "  - Melhorei a performance [sem número].\n  - Reduzi o tempo de resposta do checkout em 60% [medido].",
        evidence: "Reduced the response time of the checkout by 60%",
      },
      // 75% is nowhere in the file.
      {
        part: "experience:beta — backend",
        find: "- Tecnologias: Python",
        replace: "- Tecnologias: Python (75% do código)",
        evidence: "Python and FastAPI",
      },
    ]);
    const waiting = await ctx.suggestions();
    expect(waiting).toHaveLength(1);
    expect(waiting[0].replace).toContain(
      "Reduzi o tempo de resposta do checkout em 60% [a confirmar]."
    );
  });

  it("never rewrites a line whose figure the person marked", async () => {
    const ctx = await setup();
    await new ProfileService(ctx.db, ctx.tasks).saveDraft({
      userId: ctx.user.id,
      markdown: profile.replace(
        "Melhorei a performance [sem número].",
        "Reduzi o tempo em 60% [medido: painel de APM]."
      ),
      baseRevision: 1,
    });
    const source = await ctx.upload();
    await ctx.run(source, [
      {
        part: "experience:beta — backend",
        find: "  - Reduzi o tempo em 60% [medido: painel de APM].",
        replace:
          "  - Reduzi o tempo de resposta do checkout em 60% [a confirmar].",
        evidence: "Reduced the response time of the checkout by 60%",
      },
    ]);
    expect(await ctx.suggestions()).toEqual([]);
  });

  it("drops a change with no passage of the file behind it", async () => {
    const ctx = await setup();
    const source = await ctx.upload();
    await ctx.run(source, [
      {
        part: "experience:beta — backend",
        find: "- Tecnologias: Python",
        replace: "- Tecnologias: Python, Kubernetes",
        evidence: "Deployed everything on Kubernetes",
      },
    ]);
    expect(await ctx.suggestions()).toEqual([]);
  });

  it("refuses a file that isn't about a career", async () => {
    const ctx = await setup();
    const source = await ctx.upload("Bolo de cenoura: ".padEnd(300, "x"));
    await ctx.run(source, [], {
      is_career_document: false,
      has_confidentiality_rules: false,
    });
    const { documents } = await ctx.timeline();
    expect(documents[0]).toMatchObject({
      importStatus: "rejected",
      importRejection: "not_a_career_document",
    });
    expect(await ctx.suggestions()).toEqual([]);
  });

  it("proposes an empty profile's first draft as suggestions too", async () => {
    const ctx = await setup({ withDraft: false });
    const source = await ctx.upload();
    await ctx.run(source, [
      {
        part: "experience",
        find: "",
        replace:
          "### Gama — Junior Developer (2019-02 to 2022-02)\n- Tools: SQL\n- Results:\n  - Built sales reports used daily by the commercial team [no number].\n- What I did NOT do in this position (so as not to overstate):",
        evidence: "Built sales reports in SQL",
      },
    ]);
    // The template came in the file's language; the draft is still it.
    const draft = await new ProfileService(ctx.db, ctx.tasks).getDraft({
      userId: ctx.user.id,
      language: "pt-BR",
    });
    expect(draft.markdown).toContain("## Professional identity");
    expect(draft.markdown).not.toContain("Gama");
    expect((await ctx.suggestions())[0].replace).toContain("### Gama");
  });

  it("leaves a summary for the agent to say once", async () => {
    const ctx = await setup();
    const source = await ctx.upload(resume, "cv-2024.txt");
    await ctx.run(source, [
      {
        part: "experience:beta — backend",
        find: "- Tecnologias: Python",
        replace: "- Tecnologias: Python, FastAPI",
        evidence: "Python and FastAPI",
      },
    ]);
    expect((await ctx.timeline()).documents[0]).toMatchObject({
      importStatus: "imported",
      summaryPending: true,
    });
    const { chatId } = await new AgentChatService(ctx.db).current(ctx.user.id);
    const pending = await pendingImportSummaries(ctx.db, chatId);
    expect(pending?.text).toBe(
      "Li “cv-2024.txt” e propus 1 mudança no perfil; ela espera você no texto, para aceitar ou recusar. Falta dizer o que você não fez na Gama."
    );
    await markImportSummariesSaid(ctx.db, pending!.sourceDocumentIds);
    expect(await pendingImportSummaries(ctx.db, chatId)).toBeNull();
    expect((await ctx.timeline()).documents[0].summaryPending).toBe(false);
  });

  it("starts as a charged task, for the source's owner only", async () => {
    const ctx = await setup();
    const source = await ctx.upload();
    const imports = new ImportService(ctx.db, ctx.tasks);
    await imports.start({ userId: ctx.user.id, sourceDocumentId: source });
    expect(ctx.trigger.trigger).toHaveBeenCalledWith(
      "import_document",
      expect.anything(),
      { concurrencyKey: ctx.user.id }
    );
    expect((await ctx.timeline()).documents[0].importStatus).toBe("importing");
    // Already importing: not started twice.
    await expect(
      imports.start({ userId: ctx.user.id, sourceDocumentId: source })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const other = await createTestUser("grace@example.com");
    await new CareerService(ctx.db).getOrCreateProfile({
      userId: other.id,
      defaultLanguage: "en-US",
    });
    await expect(
      imports.start({ userId: other.id, sourceDocumentId: source })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
