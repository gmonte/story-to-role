import { randomBytes } from "node:crypto";

import { streamText, type LanguageModel, type ModelMessage } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentChatRepository } from "@repo/api/domains/agents/agent-chat-repository";
import { AgentChatService } from "@repo/api/domains/agents/agent-chat-service";
import { composeAgentMessage } from "@repo/api/domains/agents/agent-message";
import { CareerService } from "@repo/api/domains/career/career-service";
import { creditCap } from "@repo/api/domains/credits/credit-pricing";
import { creditEntriesTable } from "@repo/api/domains/credits/db/credits-tables";
import { finishTask } from "@repo/api/domains/tasks/run-task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";
import type { MisuseGuard } from "@repo/api/tools/misuse-guard";
import type { RateLimiter } from "@repo/api/tools/rate-limit";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";

import { ProfileRepository } from "../profile-repository";
import { ProfileService } from "../profile-service";
import { runAgentTurn } from "./run-agent-turn";

vi.mock("@repo/common/env/web.env", () => ({
  env: {
    ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}`,
    ANTHROPIC_API_KEY: "test-key",
  },
}));

// The topic gate's provider: scripted, no network.
let gate: ReturnType<typeof fakeProviderPackage>;
vi.mock(
  "@repo/api/domains/ai/providers/anthropic-package",
  async (original) => ({
    ...(await original<object>()),
    createAnthropicPackage: () => gate.providerPackage,
  })
);

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

type ToolCall = { name: string; input: unknown };

/**
 * The agent's model: each step makes the next batch of tool calls, then it
 * answers. What it was sent is kept, to read its prompt and tool results.
 */
function agentModel(steps: ToolCall[][], answer: string) {
  let step = 0;
  const prompts: unknown[] = [];
  const model = new MockLanguageModelV3({
    doStream: (options) => {
      prompts.push(options.prompt);
      const calls = steps[step++];
      const parts = calls
        ? [
            ...calls.map((call, index) => ({
              type: "tool-call" as const,
              toolCallId: `call-${step}-${index}`,
              toolName: call.name,
              input: JSON.stringify(call.input),
            })),
            {
              type: "finish" as const,
              finishReason: { unified: "tool-calls" as const, raw: "tool_use" },
              usage,
            },
          ]
        : [
            { type: "text-start" as const, id: "t" },
            { type: "text-delta" as const, id: "t", delta: answer },
            { type: "text-end" as const, id: "t" },
            {
              type: "finish" as const,
              finishReason: { unified: "stop" as const, raw: "end_turn" },
              usage,
            },
          ];
      return Promise.resolve({
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      });
    },
  });
  return { model, prompts };
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

- Nuvem em produção.

## Regras de comunicação

- Nunca incluir: Projeto Fênix
`;

async function setup({ credits }: { credits?: number } = {}) {
  const db = await getTestDatabase();
  const user = await createTestUser("ada@example.com", { credits });
  const career = new CareerService(db);
  await career.getOrCreateProfile({
    userId: user.id,
    defaultLanguage: "pt-BR",
  });
  await career.acceptPrivacyNotice(user.id);
  const trigger = {
    trigger: vi.fn(async () => ({ runId: "run", accessToken: "token" })),
  };
  const profiles = new ProfileService(db, new TasksService(db, trigger));
  await profiles.saveDraft({
    userId: user.id,
    markdown: profile,
    baseRevision: 0,
  });
  const { chatId } = await new AgentChatService(db).current(user.id);
  const recordBlocked = vi.fn(async (_userId: string) => undefined);
  const misuse: MisuseGuard = {
    isCoolingDown: async () => false,
    recordBlocked,
  };
  const reported: string[] = [];
  const reviewResolved = vi.fn();
  // A completed validation with these findings, as the task leaves it.
  const seedReport = async (
    findings: Array<{
      kind: "noImpact" | "unknown";
      quote: string;
      message: string;
    }>
  ) => {
    const repository = new ProfileRepository(db);
    const document = await repository.findDocument(user.id, "profile");
    const cipher = await getUserCipher(db, user.id);
    await repository.insertValidation({
      documentId: document.id,
      draftRevision: document.draftRevision,
      status: "completed",
      completedAt: new Date(),
      encryptedReport: cipher.encrypt(
        JSON.stringify({ findings, competencies: [], reviewed: [] })
      ),
    });
    return { document, cipher };
  };
  gate = fakeProviderPackage({ object: () => ({ verdict: "on_topic" }) });

  async function say(
    text: string,
    model: LanguageModel,
    earlier: ModelMessage[] = [],
    rateLimiter: RateLimiter = { allow: async () => true }
  ) {
    const { result, turn } = await runAgentTurn(
      {
        db,
        misuse,
        rateLimiter,
        streamText,
        model: () => model,
        reportSuggestion: (id) => reported.push(id),
        reportReviewResolved: reviewResolved,
      },
      { chatId, messages: [...earlier, { role: "user", content: text }] }
    );
    const reply = await result.text;
    // As the chat agent does when the turn completes.
    if (turn) await finishTask({ db, ...turn });
    return { text: reply, turn };
  }

  return {
    db,
    user,
    chatId,
    profiles,
    recordBlocked,
    reported,
    reviewResolved,
    seedReport,
    say,
  };
}

const systemOf = (prompt: unknown) =>
  JSON.stringify(
    (prompt as Array<{ role: string }>).filter((m) => m.role === "system")
  );

describe("the profile agent", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("gets the quoted passage with its part, the index, gaps and rules, not the document", async () => {
    const ctx = await setup();
    const { model, prompts } = agentModel([], "O que mudou na prática?");
    await ctx.say(
      composeAgentMessage(
        "Melhorei a performance [sem número].",
        "Como deixo isso mais claro?"
      ),
      model
    );
    const system = systemOf(prompts[0]);
    expect(system).toContain("Melhorei a performance [sem número].");
    expect(system).toContain("experience:beta — backend");
    expect(system).toContain("não liderei pessoas");
    expect(system).toContain("Nuvem em produção.");
    expect(system).toContain("Projeto Fênix");
    // Another part's content stays out until the agent reads it.
    expect(system).not.toContain("Dev backend.");
  });

  it("tells the agent about the finding attached to the message", async () => {
    const ctx = await setup();
    const { model, prompts } = agentModel([], "Anotado.");
    await ctx.say(
      composeAgentMessage("Melhorei a performance [sem número].", "", null, {
        kind: "finding",
        text: "Falta o resultado.",
      }),
      model
    );
    const system = systemOf(prompts[0]);
    expect(system).toContain("A finding or a review being discussed");
    expect(system).toContain("Melhorei a performance [sem número].");
  });

  it("keeps the passage for the answers that follow it", async () => {
    const ctx = await setup();
    const { model, prompts } = agentModel([], "Anotado.");
    await ctx.say("Foi no checkout, e fui eu.", model, [
      {
        role: "user",
        content: composeAgentMessage(
          "Melhorei a performance [sem número].",
          "Como deixo isso mais claro?"
        ),
      },
      { role: "assistant", content: "O que mudou na prática?" },
    ]);
    const system = systemOf(prompts[0]);
    expect(system).toContain("Melhorei a performance [sem número].");
    expect(system).toContain("experience:beta — backend");
  });

  it("takes the part the message names when the line is in several", async () => {
    const ctx = await setup();
    const second = profile.replace(
      "## Formação",
      "### Gama — Júnior (2019-02 a 2022-02)\n\n- Tecnologias: Python\n- O que NÃO fiz: nada de front.\n\n## Formação"
    );
    await ctx.profiles.saveDraft({
      userId: ctx.user.id,
      markdown: second,
      baseRevision: 1,
    });
    const named = agentModel([], "Ok.");
    await ctx.say(
      composeAgentMessage(
        "Tecnologias: Python",
        "Faltou alguma?",
        "experience:gama — júnior"
      ),
      named.model
    );
    expect(systemOf(named.prompts[0])).toContain("nada de front");

    // Unnamed, the line is in both experiences: no part is assumed.
    const unnamed = agentModel([], "Ok.");
    await ctx.say(
      composeAgentMessage("Tecnologias: Python", "Faltou alguma?"),
      unnamed.model
    );
    const system = systemOf(unnamed.prompts[0]);
    expect(system).toContain("Its part isn't certain");
    expect(system).not.toContain("nada de front");
  });

  it("never opens the model's history on a tool result", async () => {
    const ctx = await setup();
    const { model, prompts } = agentModel([], "Ok.");
    const turns: ModelMessage[] = Array.from({ length: 9 }, (_, index) => [
      { role: "user" as const, content: `Mensagem ${index}` },
      { role: "assistant" as const, content: `Resposta ${index}` },
    ]).flat();
    await ctx.say("E agora?", model, [
      ...turns.slice(0, 3),
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "read_part",
            input: { part: "identity" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "read_part",
            output: { type: "json", value: { text: "x" } },
          },
        ],
      },
      ...turns.slice(3, 17),
    ]);
    const sent = prompts[0] as Array<{ role: string }>;
    expect(sent.find((m) => m.role !== "system")?.role).toBe("user");
    expect(sent.some((m) => m.role === "tool")).toBe(false);
  });

  it("reads another part through its tool", async () => {
    const ctx = await setup();
    const { model, prompts } = agentModel(
      [[{ name: "read_part", input: { part: "identity" } }]],
      "Li."
    );
    await ctx.say("O que diz a minha identidade?", model);
    expect(JSON.stringify(prompts[1])).toContain("Dev backend.");
  });

  it("changes the profile only through suggestions the user accepts", async () => {
    const ctx = await setup();
    const { model } = agentModel(
      [
        [
          {
            name: "suggest_change",
            input: {
              part: "experience:beta — backend",
              find: "Melhorei a performance [sem número].",
              replace: "Melhorei a performance do checkout [sem número].",
              reason: "Você disse que foi no checkout.",
            },
          },
        ],
      ],
      "Sugeri a mudança; ela espera você no texto."
    );
    const { text } = await ctx.say("Foi a performance do checkout.", model);
    expect(text).toBe("Sugeri a mudança; ela espera você no texto.");

    // The draft is untouched; the suggestion waits, normalized to the text.
    const draft = await ctx.profiles.getDraft({
      userId: ctx.user.id,
      language: "pt-BR",
    });
    expect(draft.markdown).toBe(profile);
    const [suggestion] = await ctx.profiles.listSuggestions(ctx.user.id);
    expect(suggestion).toMatchObject({
      origin: "agent",
      part: "experience:beta — backend",
      find: "  - Melhorei a performance [sem número].",
      replace: "  - Melhorei a performance do checkout [sem número].",
      reason: "Você disse que foi no checkout.",
    });
    expect(ctx.reported).toEqual([suggestion.id]);

    await ctx.profiles.resolveSuggestions({
      userId: ctx.user.id,
      resolution: "rejected",
      profileSuggestionIds: [suggestion.id],
    });
    expect(await ctx.profiles.listSuggestions(ctx.user.id)).toEqual([]);
  });

  it("refuses a figure the user never gave, and tells the model why", async () => {
    const ctx = await setup();
    const { model, prompts } = agentModel(
      [
        [
          {
            name: "suggest_change",
            input: {
              part: "experience:beta — backend",
              find: "Melhorei a performance [sem número].",
              replace: "Melhorei a performance em 40% [estimado].",
              reason: "Um número deixa mais claro.",
            },
          },
        ],
      ],
      "De quanto foi a melhora?"
    );
    await ctx.say("Melhorou bastante.", model);
    expect(await ctx.profiles.listSuggestions(ctx.user.id)).toEqual([]);
    expect(JSON.stringify(prompts[1])).toContain("never wrote 40");

    // The same figure, once the user wrote it, goes through.
    const second = agentModel(
      [
        [
          {
            name: "suggest_change",
            input: {
              part: "experience:beta — backend",
              find: "Melhorei a performance [sem número].",
              replace: "Melhorei a performance em 40% [estimado].",
              reason: "Você estimou 40%.",
            },
          },
        ],
      ],
      "Sugeri."
    );
    await ctx.say("Uns 40%, pelo que eu lembro.", second.model);
    expect(await ctx.profiles.listSuggestions(ctx.user.id)).toHaveLength(1);
  });

  it("lists the open review notes and ignores one through its tool", async () => {
    const ctx = await setup();
    const { document, cipher } = await ctx.seedReport([
      { kind: "noImpact", quote: "Dev backend.", message: "O que mudou?" },
      { kind: "unknown", quote: "Python", message: "Qual o time?" },
    ]);
    expect(document).toBeTruthy();
    expect(cipher).toBeTruthy();
    const { model, prompts } = agentModel(
      [[{ name: "resolve_review_note", input: { note: 2, reason: "r" } }]],
      "Ignorei a nota."
    );
    await ctx.say("Já respondi isso no perfil.", model);
    const system = systemOf(prompts[0]);
    expect(system).toContain("O que mudou?");
    expect(system).toContain("Qual o time?");
    expect(system).toContain("resolve_review_note");
    expect(ctx.reviewResolved).toHaveBeenCalledTimes(1);
    const notes = await ctx.profiles.unresolvedReviewNotes(ctx.user.id);
    expect(notes.map((note) => note.message)).toEqual(["O que mudou?"]);
    // The next turn no longer lists the ignored one.
    const next = agentModel([], "Ok.");
    await ctx.say("Oi", next.model);
    expect(systemOf(next.prompts[0])).not.toContain("Qual o time?");
  });

  it("replaces a waiting suggestion with a newer one on the same lines", async () => {
    const ctx = await setup();
    const change = {
      part: "experience:beta — backend",
      find: "- Tecnologias: Python",
      reason: "r",
    };
    const { model } = agentModel(
      [
        [
          {
            name: "suggest_change",
            input: { ...change, replace: "- Tecnologias: Python, Go" },
          },
          {
            name: "suggest_change",
            input: { ...change, replace: "- Tecnologias: Python, Go, Rust" },
          },
        ],
      ],
      "Pronto."
    );
    await ctx.say("Usei Python, Go e Rust.", model);
    const waiting = await ctx.profiles.listSuggestions(ctx.user.id);
    expect(waiting.map((suggestion) => suggestion.replace)).toEqual([
      "- Tecnologias: Python, Go, Rust",
    ]);
  });

  it("cuts the reply after its third question", async () => {
    const ctx = await setup();
    const { model } = agentModel(
      [],
      "Qual era o time? Qual o produto? De onde vem o número? E o que você não fez?"
    );
    const { text } = await ctx.say("Trabalhei na Beta.", model);
    expect(text).toBe("Qual era o time? Qual o produto? De onde vem o número?");
  });

  it("answers off-topic messages from code, in the user's language", async () => {
    const ctx = await setup();
    gate = fakeProviderPackage({ object: () => ({ verdict: "off_topic" }) });
    const { model, prompts } = agentModel([], "never");
    const { text } = await ctx.say("Me dá uma receita de bolo?", model);
    expect(text).toContain("perfil profissional");
    expect(prompts).toHaveLength(0);
    expect(ctx.recordBlocked).toHaveBeenCalledWith(ctx.user.id);
  });

  it("holds back a burst of messages before anything is charged", async () => {
    const ctx = await setup();
    const { model, prompts } = agentModel([], "never");
    const { text, turn } = await ctx.say("Trabalhei na Beta.", model, [], {
      allow: async (name) => name !== "chatMessage",
    });
    expect(text).toContain("muitas mensagens");
    expect(turn).toBeNull();
    expect(prompts).toHaveLength(0);
  });

  it("reserves credits per message, settles them, and stops when they run out", async () => {
    // Free keeps a resume's worth in reserve (billing spec): the agent
    // can spend only what is above it. Nothing is published yet, so it
    // is sized for a usual career.
    const reserve = creditCap("generate_document", {});
    const ctx = await setup({ credits: reserve + 3 });
    const { model } = agentModel([], "Conte mais.");
    const { turn } = await ctx.say("Trabalhei na Beta.", model);
    expect(turn?.funding).toBe("credits");
    const entries = await ctx.db
      .select()
      .from(creditEntriesTable)
      .where(eq(creditEntriesTable.userId, ctx.user.id));
    expect(entries.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(["reserve", "release", "debit"])
    );

    // What is left above the reserve can't cover a message's cap of three.
    const second = agentModel([], "never");
    const { text } = await ctx.say("E na Gama também.", second.model);
    expect(text).toContain("créditos");
    expect(second.prompts).toHaveLength(0);
  });

  it("starts a new conversation: messages go, suggestions and draft stay", async () => {
    const ctx = await setup();
    const { model } = agentModel(
      [
        [
          {
            name: "suggest_change",
            input: {
              part: "experience:beta — backend",
              find: "Melhorei a performance [sem número].",
              replace: "Melhorei a performance do checkout [sem número].",
              reason: "Você disse que foi no checkout.",
            },
          },
        ],
      ],
      "Sugeri a mudança; ela espera você no texto."
    );
    await ctx.say("Foi a performance do checkout.", model);
    // The transcript the chat runtime would have stored.
    await new AgentChatRepository(ctx.db).insertMessage({
      chatId: ctx.chatId,
      messageId: "m1",
      position: 0,
      encryptedMessage: "ciphertext",
    });
    const chats = new AgentChatService(ctx.db);

    const fresh = await chats.startNew(ctx.user.id);
    expect(fresh.closedChatIds).toEqual([ctx.chatId]);
    expect(fresh.chatId).not.toBe(ctx.chatId);
    expect(fresh.messages).toEqual([]);
    expect((await chats.current(ctx.user.id)).chatId).toBe(fresh.chatId);
    expect(
      await new AgentChatRepository(ctx.db).listMessages(ctx.chatId)
    ).toEqual([]);
    await expect(
      chats.requireOwn({ userId: ctx.user.id, chatId: ctx.chatId })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await ctx.profiles.listSuggestions(ctx.user.id)).toHaveLength(1);
    const draft = await ctx.profiles.getDraft({
      userId: ctx.user.id,
      language: "pt-BR",
    });
    expect(draft.markdown).toBe(profile);
  });

  it("opens a conversation only for its owner", async () => {
    const ctx = await setup();
    const other = await createTestUser("grace@example.com");
    const chats = new AgentChatService(ctx.db);
    await expect(
      chats.requireOwn({ userId: other.id, chatId: ctx.chatId })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await new CareerService(ctx.db).getOrCreateProfile({
      userId: other.id,
      defaultLanguage: "en-US",
    });
    await new CareerService(ctx.db).acceptPrivacyNotice(other.id);
    await expect(
      chats.requireOwn({ userId: other.id, chatId: ctx.chatId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
