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
import { AgentChatService } from "@repo/api/domains/agents/agent-chat-service";

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
  const calls: string[] = [];
  async function run(
    sourceDocumentId: string,
    changes: Change[] | ((comparing: string) => Change[]),
    check = { is_career_document: true, has_confidentiality_rules: false }
  ) {
    const { providerPackage } = fakeProviderPackage({
      object: (request) => {
        const { system } = request;
        const messages = (request as { messages?: Array<{ content: string }> })
          .messages;
        if (system.startsWith("Decide whether")) return check;
        const comparing = messages?.[0]?.content ?? "";
        calls.push(comparing);
        const answered =
          typeof changes === "function" ? changes(comparing) : changes;
        return {
          changes: answered.map((change) => ({ reason: "r", ...change })),
          missing: "Falta dizer o que você não fez na Gama.",
        };
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

  const remove = (sourceDocumentId: string) =>
    new DocumentsService(db, storage).remove({
      userId: user.id,
      sourceDocumentId,
    });
  const timeline = () =>
    career.getTimeline({ userId: user.id, defaultLanguage: "pt-BR" });
  const suggestions = () => profiles.listSuggestions(user.id);
  return {
    db,
    user,
    tasks,
    trigger,
    upload,
    run,
    calls,
    remove,
    timeline,
    suggestions,
  };
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
    // Refused before any work for the user: its task charges nothing.
    await expect(
      ctx.run(source, [], {
        is_career_document: false,
        has_confidentiality_rules: false,
      })
    ).resolves.toEqual({ rejected: true });
    const { documents } = await ctx.timeline();
    expect(documents[0]).toMatchObject({
      importStatus: "rejected",
      importRejection: "not_a_career_document",
    });
    expect(await ctx.suggestions()).toEqual([]);
  });

  it("suggests an empty profile's first draft too, on the template in the interface language", async () => {
    const ctx = await setup({ withDraft: false });
    const source = await ctx.upload();
    // Starting the import gives a user who never opened the editor their
    // profile, from the template.
    await new ImportService(ctx.db, ctx.tasks).start({
      userId: ctx.user.id,
      sourceDocumentId: source,
      language: "en-US",
    });
    await ctx.run(source, [
      {
        part: "experience",
        find: "",
        replace:
          "### Gama — Junior Developer (2019-02 to 2022-02)\n- Tools: SQL\n- Results:\n  - Built sales reports used daily by the commercial team [no number].\n- What I did NOT do in this position (so as not to overstate):",
        evidence: "Built sales reports in SQL",
      },
    ]);
    const draft = await new ProfileService(ctx.db, ctx.tasks).getDraft({
      userId: ctx.user.id,
      language: "pt-BR",
    });
    expect(draft.markdown).toContain("## Professional identity");
    // Nothing is written until the user accepts.
    expect(draft.markdown).not.toContain("Gama");
    expect((await ctx.suggestions())[0].replace).toContain("### Gama");
  });

  it("completes a waiting suggestion instead of repeating it", async () => {
    const ctx = await setup();
    // A first file left a new position waiting.
    const first = await ctx.upload();
    await ctx.run(first, [
      {
        part: "experience",
        find: "",
        replace:
          "### Gama — Júnior (2019-02 a 2022-02)\n- Tecnologias: SQL\n- Resultados:\n- O que NÃO fiz neste cargo (para não exagerar):",
        evidence: "Built sales reports in SQL",
      },
    ]);
    const [waiting] = await ctx.suggestions();

    // A second file about the same position adds to it.
    const second = await ctx.upload(
      `${resume}\nAt Gama I also maintained Django APIs and cut costs by 15%.`,
      "linkedin.txt"
    );
    await ctx.run(second, [
      {
        part: `pending:${waiting.id}`,
        find: "- Tecnologias: SQL",
        replace: "- Tecnologias: SQL, Django",
        evidence: "maintained Django APIs",
      },
      {
        part: `pending:${waiting.id}`,
        find: "- Resultados:",
        replace: "- Resultados:\n  - Cortei custos em 15%.",
        evidence: "cut costs by 15%",
      },
      // The same position again, as if it were new: the model's mistake.
      {
        part: "pending:unknown",
        find: "",
        replace: "- Tecnologias: Java",
        evidence: "maintained Django APIs",
      },
    ]);
    const after = await ctx.suggestions();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ part: "experience", find: "" });
    expect(after[0].replace).toBe(
      "### Gama — Júnior (2019-02 a 2022-02)\n- Tecnologias: SQL, Django\n- Resultados:\n  - Cortei custos em 15% [a confirmar].\n- O que NÃO fiz neste cargo (para não exagerar):"
    );
  });

  it("takes a truth file's rules to the communication rules", async () => {
    const ctx = await setup();
    const source = await ctx.upload(
      `${resume}\n❌ DO NOT INCLUDE: the client Alfa Bank, internal codename Phoenix.`
    );
    await ctx.run(
      source,
      [
        {
          part: "rules",
          find: "- Nunca incluir:",
          replace: "- Nunca incluir: o cliente Alfa Bank, o codinome Phoenix",
          evidence: "DO NOT INCLUDE: the client Alfa Bank",
        },
      ],
      { is_career_document: true, has_confidentiality_rules: true }
    );
    expect((await ctx.suggestions())[0]).toMatchObject({
      part: "rules",
      replace: "- Nunca incluir: o cliente Alfa Bank, o codinome Phoenix",
    });
    expect((await ctx.timeline()).documents[0].kind).toBe("truth_file");
  });

  it("needs a real passage of the file, not a word", async () => {
    const ctx = await setup();
    const source = await ctx.upload();
    await ctx.run(source, [
      {
        part: "experience:beta — backend",
        find: "- Tecnologias: Python",
        replace: "- Tecnologias: Python, Kubernetes",
        evidence: "Python",
      },
    ]);
    expect(await ctx.suggestions()).toEqual([]);
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
      "Li “cv-2024.txt” e deixei 1 sugestão no perfil, para você aceitar ou recusar no texto: Beta — Backend. Os números que vieram do arquivo estão como [a confirmar]. Falta dizer o que você não fez na Gama."
    );
    await markImportSummariesSaid(ctx.db, pending!.sourceDocumentIds);
    expect(await pendingImportSummaries(ctx.db, chatId)).toBeNull();
    expect((await ctx.timeline()).documents[0].summaryPending).toBe(false);
  });

  it("starts as a charged task, for the source's owner only", async () => {
    const ctx = await setup();
    const source = await ctx.upload();
    const imports = new ImportService(ctx.db, ctx.tasks);
    await imports.start({
      userId: ctx.user.id,
      sourceDocumentId: source,
      language: "pt-BR",
    });
    expect(ctx.trigger.trigger).toHaveBeenCalledWith(
      "import_document",
      expect.anything(),
      { concurrencyKey: ctx.user.id }
    );
    expect((await ctx.timeline()).documents[0].importStatus).toBe("importing");
    // A file being read can't be removed.
    await expect(ctx.remove(source)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    // Already importing: not started twice.
    await expect(
      imports.start({
        userId: ctx.user.id,
        sourceDocumentId: source,
        language: "pt-BR",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const other = await createTestUser("grace@example.com");
    await new CareerService(ctx.db).getOrCreateProfile({
      userId: other.id,
      defaultLanguage: "en-US",
    });
    await expect(
      imports.start({
        userId: other.id,
        sourceDocumentId: source,
        language: "en-US",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("splits an addition into one suggestion per top-level item", async () => {
    const ctx = await setup();
    const source = await ctx.upload();
    await ctx.run(source, [
      {
        part: "certifications",
        find: "",
        replace:
          "- AWS Cloud Practitioner — AWS — concluída\n- Scrum Master — Scrum.org — concluída\n  - Nível um\n- Python Institute PCAP — PI — concluída",
        reason: "Certificações do arquivo",
        evidence: "Backend Developer",
      },
    ]);
    const waiting = await ctx.suggestions();
    expect(waiting.map((suggestion) => suggestion.replace)).toEqual([
      "- AWS Cloud Practitioner — AWS — concluída",
      "- Scrum Master — Scrum.org — concluída\n  - Nível um",
      "- Python Institute PCAP — PI — concluída",
    ]);
    expect(waiting.every((s) => s.reason === "Certificações do arquivo")).toBe(
      true
    );
  });

  it("compares a structured file in parts, each seeing only its part", async () => {
    const ctx = await setup();
    const experience = (name: string) =>
      `### ${name} — Dev (2020-01 a 2021-01)\n\n- Contexto: trabalho na ${name}\n- Tecnologias: Go, ${name}Tool\n`;
    const names = ["Alfa", "Bravo", "Charlie", "Delta", "Echo"];
    const file = `# Truth\n\n## Identidade profissional\n\n- Dev backend sênior.\n\n## Experiência\n\n${names.map(experience).join("\n")}\n## Formação\n\n- Sistemas de Informação\n`;
    const source = await ctx.upload(file, "truth.md");
    const result = await ctx.run(source, (comparing) =>
      names
        .filter(
          (name) =>
            comparing.includes(`<file>`) &&
            comparing.split("<file>")[1].includes(`${name} — Dev`)
        )
        .map((name) => ({
          part: "experience",
          find: "",
          replace: `### ${name} — Dev (2020-01 a 2021-01)\n- Tecnologias: Go, ${name}Tool`,
          evidence: `Tecnologias: Go, ${name}Tool`,
        }))
    );
    // The sections, then two batches of up to three positions.
    expect(ctx.calls).toHaveLength(3);
    const seen = ctx.calls.map((call) => call.split("<file>")[1]);
    expect(seen[0]).not.toContain("Alfa");
    expect(seen[0]).toContain("Sistemas de Informação");
    expect(seen[1]).toContain("Alfa");
    expect(seen[1]).toContain("Charlie");
    expect(seen[1]).not.toContain("Delta");
    expect(seen[1]).not.toContain("Sistemas de Informação");
    expect(seen[2]).toContain("Echo");
    expect(seen[2]).not.toContain("Alfa");
    expect(result).toMatchObject({ rejected: false, suggested: 5 });
    expect(
      (await ctx.suggestions()).map((suggestion) => suggestion.replace)
    ).toHaveLength(5);
  });
});
