import { randomBytes } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { streamText, type LanguageModel, type ModelMessage } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentChatRepository } from "@repo/api/domains/agents/agent-chat-repository";
import { AgentChatService } from "@repo/api/domains/agents/agent-chat-service";
import { composeAgentMessage } from "@repo/api/domains/agents/agent-message";
import { agentSettings, dayMs } from "@repo/api/domains/agents/agent-settings";
import { CareerService } from "@repo/api/domains/career/career-service";
import { creditCap } from "@repo/api/domains/credits/credit-pricing";
import { creditEntriesTable } from "@repo/api/domains/credits/db/credits-tables";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { MotivationRepository } from "@repo/api/domains/applications/motivation/motivation-repository";
import { ResearchRepository } from "@repo/api/domains/applications/research/research-repository";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import { ProfileRepository } from "@repo/api/domains/profile/profile-repository";
import { ProfileService } from "@repo/api/domains/profile/profile-service";
import { loadNeverIncludeFilter } from "@repo/api/domains/profile/rules/load-never-include-filter";
import { finishTask } from "@repo/api/domains/tasks/run-task";
import { tasksTable } from "@repo/api/domains/tasks/db/tasks-tables";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";
import type { MisuseGuard } from "@repo/api/tools/misuse-guard";

import { readChangeContent } from "../changes/propose-change";
import { DocumentsRepository } from "../documents-repository";
import { DocumentsService } from "../documents-service";
import { loadCareerContext } from "../generation/load-career-context";
import type { CoverLetterContent } from "../schemas/cover-letter-content";
import type { ResumeContent } from "../schemas/resume-content";
import { reviewerAttachment } from "./reviewer-attachment";
import { runDocumentAgentTurn } from "./run-document-agent-turn";

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

const profileMarkdown = `# Profile

## Professional identity

- Professional name: Ada Lovelace
- Platform engineer and tech lead.

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

## Education

## Certifications

## Competencies

- I master: Kubernetes, Terraform

## Languages

- English — C1

## Known gaps

- Go in production.

## Communication rules

- Never include: Project Phoenix
`;

const systemOf = (prompt: unknown) =>
  JSON.stringify(
    (prompt as Array<{ role: string }>).filter((m) => m.role === "system")
  );

/** The tool results the model was sent, as text. */
const toolResultsOf = (prompt: unknown) =>
  JSON.stringify(
    (prompt as Array<{ role: string }>).filter((m) => m.role === "tool")
  );

async function setup({ credits }: { credits?: number } = {}) {
  const db = await getTestDatabase();
  const user = await createTestUser("ada@example.com", { credits });
  const career = new CareerService(db);
  const profile = await career.getOrCreateProfile({
    userId: user.id,
    defaultLanguage: "en-US",
  });
  await career.acceptPrivacyNotice(user.id);
  const cipher = await getUserCipher(db, user.id);
  const trigger = {
    trigger: vi.fn(async () => ({ runId: "run", accessToken: "t" })),
  };
  const tasks = new TasksService(db, trigger);
  const profiles = new ProfileService(db, tasks);
  const current = await profiles.getDraft({
    userId: user.id,
    language: "en-US",
  });
  const { revision } = await profiles.saveDraft({
    userId: user.id,
    markdown: profileMarkdown,
    baseRevision: current.revision,
  });
  await profiles.publish({ userId: user.id, baseRevision: revision });
  const published = await new ProfileRepository(db).findDocument(
    user.id,
    "profile"
  );
  const profileVersionId = published.publishedVersionId!;

  // The career as generation read it: the ids lines cite.
  const context = await loadCareerContext({
    db,
    cipher,
    profileId: profile.id,
    filter: await loadNeverIncludeFilter({ db, cipher, profileId: profile.id }),
  });
  const position = context.positions[0];
  const deploy = context.evidence.find((row) =>
    row.text.includes("Cut deploy time by 40%")
  )!;

  const openings = new OpeningsRepository(db);
  const opening = await openings.insertOpening({
    profileId: profile.id,
    kind: "posted",
    status: "analyzed",
    encryptedTitle: cipher.encrypt("Platform Engineer"),
    encryptedCompany: cipher.encrypt("Hooli"),
  });
  const terms = await openings.replaceTerms(opening.id, [
    {
      openingId: opening.id,
      kind: "keyword",
      category: "tool",
      encryptedText: cipher.encrypt("Kubernetes"),
    },
    {
      openingId: opening.id,
      kind: "keyword",
      category: "tool",
      encryptedText: cipher.encrypt("Go"),
    },
  ]);
  await openings.insertFitCheck({
    openingId: opening.id,
    band: "medium",
    items: [
      {
        termId: terms[0].id,
        verdict: "met",
        evidenceIds: [],
        encryptedExplanation: cipher.encrypt("Runs Kubernetes"),
      },
      {
        termId: terms[1].id,
        verdict: "gap",
        evidenceIds: [],
        encryptedExplanation: cipher.encrypt("No Go"),
      },
    ],
  });

  const repository = new DocumentsRepository(db);
  const header = {
    name: "Ada Lovelace",
    titleLine: "Platform Engineer | Kubernetes",
    contacts: ["ada@example.com"],
    city: "Belo Horizonte, MG",
  };

  /** A resume of the user's: in the library (a focus) or for the opening. */
  async function insertResume(where: "library" | "opening") {
    const document = await repository.insertDocument({
      profileId: profile.id,
      kind: "resume",
      ...(where === "library"
        ? { encryptedFocus: cipher.encrypt("Platform roles") }
        : {
            applicationId: (
              await repository.findOrInsertApplication({
                profileId: profile.id,
                openingId: opening.id,
                status: "in_preparation",
                tone: "direct",
              })
            ).id,
          }),
    });
    const version = await repository.insertVersion({
      documentId: document.id,
      language: "en-US",
    });
    const content: ResumeContent = {
      kind: "resume",
      header,
      sections: [
        {
          kind: "summary",
          line: {
            id: "sum1",
            text: "Engineer who cut deploy time by 40%.",
            origin: { kind: "evidence", evidenceIds: [deploy.id] },
          },
        },
        {
          kind: "experience",
          entries: [
            {
              positionId: position.id,
              employer: position.employer,
              title: position.title,
              startDate: position.startDate,
              endDate: position.endDate,
              context: null,
              lines: [
                {
                  id: "exp1",
                  text: "Cut deploy time by 40% with Kubernetes.",
                  origin: { kind: "evidence", evidenceIds: [deploy.id] },
                },
                {
                  id: "exp2",
                  text: "Mentored two interns.",
                  origin: { kind: "manual" },
                },
              ],
            },
          ],
        },
      ],
    };
    await repository.insertSnapshot({
      versionId: version.id,
      sequence: 1,
      origin: "generated",
      author: "ai",
      encryptedContent: cipher.encrypt(JSON.stringify(content)),
      profileVersionId,
    });
    return { document, version };
  }

  /** A cover letter of the user's for the opening. */
  async function insertLetter() {
    const application = await repository.findOrInsertApplication({
      profileId: profile.id,
      openingId: opening.id,
      status: "in_preparation",
      tone: "direct",
    });
    const document = await repository.insertDocument({
      profileId: profile.id,
      kind: "cover_letter",
      applicationId: application.id,
    });
    const version = await repository.insertVersion({
      documentId: document.id,
      language: "en-US",
    });
    const content: CoverLetterContent = {
      kind: "cover_letter",
      header,
      greeting: "Dear hiring team,",
      paragraphs: [
        {
          id: "par1",
          text: "At Globex I cut deploy time by 40% with Kubernetes.",
          origin: {
            kind: "letter",
            evidenceIds: [deploy.id],
            companyFactIds: [],
            motivationPointIds: [],
            instructionIds: [],
          },
        },
      ],
      closing: "Best regards,",
    };
    await repository.insertSnapshot({
      versionId: version.id,
      sequence: 1,
      origin: "generated",
      author: "ai",
      encryptedContent: cipher.encrypt(JSON.stringify(content)),
      profileVersionId,
    });
    return { document, version };
  }

  const misuse: MisuseGuard = {
    isCoolingDown: async () => false,
    recordBlocked: vi.fn(async (_userId: string) => undefined),
  };
  gate = fakeProviderPackage({ object: () => ({ verdict: "on_topic" }) });

  const reported: string[] = [];
  async function say(
    chatId: string,
    text: string,
    model: LanguageModel,
    earlier: ModelMessage[] = []
  ) {
    const { result, turn } = await runDocumentAgentTurn(
      {
        db,
        misuse,
        rateLimiter: { allow: async () => true },
        streamText,
        model: () => model,
        reportChange: (documentChangeId) => reported.push(documentChangeId),
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
    cipher,
    profileVersionId,
    insertResume,
    insertLetter,
    say,
    reported,
    position,
    deploy,
    opening,
    profileId: profile.id,
    terms,
    openings,
    chats: new AgentChatService(db),
  };
}

describe("the document agent", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("reads a resume with its traces, the opening, the rules and the frozen profile's index, never the profile itself", async () => {
    const ctx = await setup();
    const { document, version } = await ctx.insertResume("opening");
    const { chatId } = await ctx.chats.current(ctx.user.id, {
      kind: "document",
      documentId: document.id,
    });
    const { model, prompts } = agentModel(
      [
        [
          {
            name: "read_part",
            input: { part: "experience:globex — tech lead" },
          },
        ],
      ],
      "It rests on your measured deploy result."
    );
    const { text } = await ctx.say(
      chatId,
      composeAgentMessage(
        "Cut deploy time by 40% with Kubernetes.",
        "Where does this come from?",
        null,
        null,
        version.id
      ),
      model
    );
    expect(text).toBe("It rests on your measured deploy result.");
    const system = systemOf(prompts[0]);
    // The document, line by line with its traces.
    expect(system).toContain("[exp1] Cut deploy time by 40% with Kubernetes.");
    expect(system).toContain("profile: “Results: Cut deploy time by 40%");
    expect(system).toContain("(Tech Lead, Globex)");
    expect(system).toContain("[exp2] Mentored two interns.");
    expect(system).toContain("written by the person");
    expect(system).toContain("Globex — Tech Lead");
    // The purpose: the opening with its fit check.
    expect(system).toContain("Platform Engineer at Hooli");
    expect(system).toContain("Kubernetes | met");
    expect(system).toContain("Go | gap");
    // The frozen version: its number and index, not its text.
    expect(system).toContain("version 1");
    expect(system).toContain("experience:globex — tech lead");
    expect(system).not.toContain("Led a team of 5 engineers");
    // The rules, the gaps, the settings and the selected passage.
    expect(system).toContain("Project Phoenix");
    expect(system).toContain("Go in production");
    expect(system).toContain("Bullets per recent experience");
    expect(system).toContain("The passage the conversation is about");
    // read_part gave the frozen version's experience.
    expect(toolResultsOf(prompts[1])).toContain("Led a team of 5 engineers");
  });

  it("gives the agent the latest review and a reviewer's feedback sent as an attachment", async () => {
    const ctx = await setup();
    const { document, version } = await ctx.insertResume("opening");
    const store = new DocumentsRepository(ctx.db);
    const snapshot = await store.latestSnapshot(version.id);
    const generation = await store.insertGeneration({
      profileId: ctx.profileId,
      documentId: document.id,
      versionId: version.id,
      snapshotId: snapshot.id,
      language: "en-US",
      status: "completed",
      reviewDepth: "quick",
      writingLevel: "standard",
      tone: "direct",
    });
    await store.insertReviewRounds([
      {
        generationId: generation.id,
        snapshotId: null,
        round: 0,
        rating: 6,
        inputTokens: 1,
        outputTokens: 1,
        kept: true,
        encryptedReview: ctx.cipher.encrypt(
          JSON.stringify({
            coverage: [{ requirement: "Terraform at scale", level: "partial" }],
            inconsistencies: [
              {
                quote: "Mentored two interns",
                profileLine: "Led a team of 5 engineers",
                kind: "wrong_fact",
              },
            ],
            advice: ["Quantify the mentoring."],
          })
        ),
      },
    ]);
    const { chatId } = await ctx.chats.current(ctx.user.id, {
      kind: "document",
      documentId: document.id,
    });
    const { model, prompts } = agentModel([], "Fair point.");
    await ctx.say(
      chatId,
      composeAgentMessage(
        null,
        "Is the reviewer right?",
        null,
        reviewerAttachment({
          section: "contradiction",
          reviewer: 1,
          rating: 6,
          text: "Disagrees with your profile",
          quote: "Mentored two interns",
          profileLine: "Led a team of 5 engineers",
        }),
        version.id
      ),
      model
    );
    const system = systemOf(prompts[0]);
    // The attachment reaches the prompt, with the passage and profile line.
    expect(system).toContain("reviewer feedback the person asked about");
    expect(system).toContain(
      "Reviewer 1 (6/10) said (contradiction): Disagrees with your profile"
    );
    expect(system).toContain("Resume passage: “Mentored two interns”");
    expect(system).toContain("Profile line: “Led a team of 5 engineers”");
    // The review itself is in the context without an attachment.
    expect(system).toContain("What the resume's reviewers said");
    expect(system).toContain("Rating kept: 6/10");
    expect(system).toContain("Advice: Quantify the mentoring.");
    expect(system).toContain("Partly covered: Terraform at scale");
  });

  it("reads a cover letter and a library document's focus", async () => {
    const ctx = await setup();
    const letter = await ctx.insertLetter();
    const letterChat = await ctx.chats.current(ctx.user.id, {
      kind: "document",
      documentId: letter.document.id,
    });
    const letterModel = agentModel([], "Ok.");
    await ctx.say(
      letterChat.chatId,
      "Is the first paragraph strong?",
      letterModel.model
    );
    const letterSystem = systemOf(letterModel.prompts[0]);
    expect(letterSystem).toContain("the agent of one cover letter");
    expect(letterSystem).toContain(
      "[par1] At Globex I cut deploy time by 40% with Kubernetes."
    );
    expect(letterSystem).toContain("profile: “Results: Cut deploy time by 40%");
    expect(letterSystem).toContain("[greeting] Dear hiring team,");
    expect(letterSystem).toContain("Cover letter: at most");
    expect(letterSystem).toContain("No passage selected");

    const library = await ctx.insertResume("library");
    const libraryChat = await ctx.chats.current(ctx.user.id, {
      kind: "document",
      documentId: library.document.id,
    });
    const libraryModel = agentModel([], "Ok.");
    await ctx.say(libraryChat.chatId, "What is this for?", libraryModel.model);
    const librarySystem = systemOf(libraryModel.prompts[0]);
    expect(librarySystem).toContain(
      "A library document with the focus: Platform roles"
    );
    expect(librarySystem).not.toContain("Hooli");
    // One conversation per document: the two chats differ.
    expect(letterChat.chatId).not.toBe(libraryChat.chatId);
  });

  it("gives both document agents what the person answered and chose for the opening", async () => {
    const ctx = await setup();
    const { db, cipher, opening, openings, terms, deploy, position } = ctx;
    // The gap question for "Go": answered, tied to a position; and one
    // the person says they lack.
    const [fit] = await openings.latestFitChecks([opening.id]);
    const items = await openings.listFitCheckItems(fit.id);
    const go = items.find((item) => item.termId === terms[1].id)!;
    await openings.answerFitCheckItem({
      fitCheckItemId: go.id,
      encryptedGapAnswer: cipher.encrypt("I wrote Go tools at night."),
      gapLinks: {
        positionIds: [position.id],
        projectIds: [],
        notTied: false,
      },
    });
    const k8s = items.find((item) => item.termId === terms[0].id)!;
    await openings.answerFitCheckItem({
      fitCheckItemId: k8s.id,
      lackConfirmedAt: new Date(),
    });
    // The letter's chosen story, motivation and approved company facts.
    const letter = await ctx.insertLetter();
    await new DocumentsRepository(db).insertGeneration({
      profileId: ctx.profileId,
      documentId: letter.document.id,
      versionId: letter.version.id,
      language: "en-US",
      status: "completed",
      storyLineId: deploy.id,
      reviewDepth: "quick",
      writingLevel: "standard",
      tone: "direct",
    });
    const motivations = new MotivationRepository(db);
    const interview = await motivations.replaceInterview({
      profileId: ctx.profileId,
      openingId: opening.id,
      status: "finished",
    });
    await motivations.insertPoints([
      {
        profileId: ctx.profileId,
        interviewId: interview.id,
        kind: "goal",
        encryptedText: cipher.encrypt("I want to build platforms at scale."),
        status: "kept",
      },
      {
        profileId: ctx.profileId,
        interviewId: interview.id,
        kind: "goal",
        encryptedText: cipher.encrypt("A discarded point."),
        status: "removed",
      },
    ]);
    await new ResearchRepository(db).insertFacts([
      {
        profileId: ctx.profileId,
        openingId: opening.id,
        encryptedText: cipher.encrypt("Hooli runs on Kubernetes."),
        encryptedSourceUrl: cipher.encrypt("https://hooli.example"),
        encryptedSourceTitle: cipher.encrypt("Hooli"),
        approvedAt: new Date(),
      },
      {
        profileId: ctx.profileId,
        openingId: opening.id,
        encryptedText: cipher.encrypt("An unapproved fact."),
        encryptedSourceUrl: cipher.encrypt("https://hooli.example"),
        encryptedSourceTitle: cipher.encrypt("Hooli"),
      },
    ]);

    const letterChat = await ctx.chats.current(ctx.user.id, {
      kind: "document",
      documentId: letter.document.id,
    });
    const letterModel = agentModel([], "Ok.");
    await ctx.say(letterChat.chatId, "What did I tell you?", letterModel.model);
    const letterSystem = systemOf(letterModel.prompts[0]);
    expect(letterSystem).toContain("I wrote Go tools at night.");
    expect(letterSystem).toContain("Tech Lead at Globex");
    expect(letterSystem).toContain("the person says they do NOT have it");
    expect(letterSystem).toContain("chosen story: Results: Cut deploy time");
    expect(letterSystem).toContain("I want to build platforms at scale.");
    expect(letterSystem).not.toContain("A discarded point.");
    expect(letterSystem).toContain("Hooli runs on Kubernetes.");
    expect(letterSystem).not.toContain("An unapproved fact.");

    // The resume agent gets the gap answers, not the letter's inputs.
    const resume = await ctx.insertResume("opening");
    const resumeChat = await ctx.chats.current(ctx.user.id, {
      kind: "document",
      documentId: resume.document.id,
    });
    const resumeModel = agentModel([], "Ok.");
    await ctx.say(resumeChat.chatId, "And here?", resumeModel.model);
    const resumeSystem = systemOf(resumeModel.prompts[0]);
    expect(resumeSystem).toContain("I wrote Go tools at night.");
    expect(resumeSystem).not.toContain("chosen story");
    expect(resumeSystem).not.toContain("Hooli runs on Kubernetes.");
    expect(resumeSystem).not.toContain("I want to build platforms");
  });

  it("helps prepare the cover letter before it exists, and the same conversation goes on beside the letter", async () => {
    const ctx = await setup();
    const { db, cipher, opening } = ctx;
    // The opening's resume, the motivation so far and a ticked fact.
    await ctx.insertResume("opening");
    const motivations = new MotivationRepository(db);
    const interview = await motivations.replaceInterview({
      profileId: ctx.profileId,
      openingId: opening.id,
      status: "in_progress",
    });
    await motivations.insertPoints([
      {
        profileId: ctx.profileId,
        interviewId: interview.id,
        kind: "goal",
        encryptedText: cipher.encrypt("I want to build platforms at scale."),
        status: "draft",
      },
    ]);
    await motivations.insertTurn({
      interviewId: interview.id,
      role: "question",
      encryptedText: cipher.encrypt("What drew you to Hooli?"),
    });
    await new ResearchRepository(db).insertFacts([
      {
        profileId: ctx.profileId,
        openingId: opening.id,
        encryptedText: cipher.encrypt("Hooli runs on Kubernetes."),
        encryptedSourceUrl: cipher.encrypt("https://hooli.example"),
        encryptedSourceTitle: cipher.encrypt("Hooli"),
        approvedAt: new Date(),
      },
    ]);

    // The document row is made empty, with no version.
    const { documentId } = await new DocumentsService(db).letterAgentDocument({
      userId: ctx.user.id,
      openingId: opening.id,
    });
    const again = await new DocumentsService(db).letterAgentDocument({
      userId: ctx.user.id,
      openingId: opening.id,
    });
    expect(again.documentId).toBe(documentId);

    const { chatId } = await ctx.chats.current(ctx.user.id, {
      kind: "document",
      documentId,
    });
    const prep = agentModel(
      [
        [
          {
            name: "read_part",
            input: { part: "experience:globex — tech lead" },
          },
        ],
      ],
      "I can help you phrase it."
    );
    const first = await ctx.say(
      chatId,
      "Help me answer the question.",
      prep.model
    );
    expect(first.text).toBe("I can help you phrase it.");
    const system = systemOf(prep.prompts[0]);
    expect(system).toContain("isn't written yet");
    // The profile's index, the opening, the interview, the motivation
    // points so far, the ticked fact and this opening's resume.
    expect(system).toContain("experience:globex — tech lead");
    expect(system).toContain("Platform Engineer at Hooli");
    expect(system).toContain("What drew you to Hooli?");
    expect(system).toContain("motivation: I want to build platforms at scale.");
    expect(system).toContain("Hooli runs on Kubernetes.");
    expect(system).toContain("Cut deploy time by 40% with Kubernetes.");
    expect(system).toContain("Mentored two interns.");
    // The trace and the line ids of the resume are left out.
    expect(system).not.toContain("[exp1]");
    expect(system).not.toContain("written by the person");
    // Only reading the profile: nothing to change yet.
    expect(toolResultsOf(prep.prompts[1])).toContain(
      "Led a team of 5 engineers"
    );
    expect(JSON.stringify(prep.prompts[0])).not.toContain("propose_change");
    expect(first.turn).not.toBeNull();

    // The letter is generated: the document's conversation is the same
    // chat, and the agent now reads the letter.
    const letter = await new DocumentsRepository(db).insertVersion({
      documentId,
      language: "en-US",
    });
    const content: CoverLetterContent = {
      kind: "cover_letter",
      header: {
        name: "Ada Lovelace",
        titleLine: "Platform Engineer",
        contacts: [],
        city: "Belo Horizonte, MG",
      },
      greeting: "Dear hiring team,",
      paragraphs: [
        {
          id: "par1",
          text: "I want to build platforms at Hooli.",
          origin: { kind: "manual" },
        },
      ],
      closing: "Best regards,",
    };
    await new DocumentsRepository(db).insertSnapshot({
      versionId: letter.id,
      sequence: 1,
      origin: "generated",
      author: "ai",
      encryptedContent: cipher.encrypt(JSON.stringify(content)),
      profileVersionId: ctx.profileVersionId,
    });
    const next = await ctx.chats.current(ctx.user.id, {
      kind: "document",
      documentId,
    });
    expect(next.chatId).toBe(chatId);
    const after = agentModel([], "Ok.");
    await ctx.say(chatId, "How does it read?", after.model);
    const letterSystem = systemOf(after.prompts[0]);
    expect(letterSystem).toContain("I want to build platforms at Hooli.");
    expect(letterSystem).not.toContain("isn't written yet");
  });

  it("opens conversations only on the user's own documents, and only to their owner", async () => {
    const ctx = await setup();
    const { document } = await ctx.insertResume("library");
    const other = await createTestUser("bob@example.com");
    const career = new CareerService(ctx.db);
    await career.getOrCreateProfile({
      userId: other.id,
      defaultLanguage: "en-US",
    });
    await career.acceptPrivacyNotice(other.id);
    await expect(
      ctx.chats.current(other.id, { kind: "document", documentId: document.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const { chatId } = await ctx.chats.current(ctx.user.id, {
      kind: "document",
      documentId: document.id,
    });
    const own = await ctx.chats.requireOwn({ userId: ctx.user.id, chatId });
    expect(own.task).toBe("document_agent");
    await expect(
      ctx.chats.requireOwn({ userId: other.id, chatId })
    ).rejects.toBeInstanceOf(TRPCError);
    // The profile agent's turn never opens a document chat, nor the reverse.
    const profileChat = await ctx.chats.current(ctx.user.id);
    await expect(
      ctx.say(profileChat.chatId, "Hi", agentModel([], "Hi").model)
    ).rejects.toThrow("Unknown document chat");
  });

  it("proposes changes through a tool, refuses a figure nobody gave, and remembers what waits", async () => {
    const ctx = await setup();
    const { document, version } = await ctx.insertResume("library");
    const { chatId } = await ctx.chats.current(ctx.user.id, {
      kind: "document",
      documentId: document.id,
    });
    const part = `experience:${ctx.position.id}`;
    const { model, prompts } = agentModel(
      [
        [
          {
            name: "propose_change",
            input: {
              part,
              find: "[exp2] Mentored two interns.",
              replace: "Mentored two interns who now ship on their own.",
              reason: "More direct.",
              profilePassages: [
                "- Responsibilities: Led a team of 5 engineers.",
              ],
            },
          },
          {
            name: "propose_change",
            input: {
              part,
              find: "Cut deploy time by 40% with Kubernetes.",
              replace:
                "Cut deploy time by 40% and costs by 25% with Kubernetes.",
              reason: "Adds the saving.",
            },
          },
          {
            name: "propose_change",
            input: {
              part: "header",
              find: "Platform Engineer | Kubernetes",
              replace: "Staff Engineer | Kubernetes",
              reason: "A stronger title.",
            },
          },
        ],
      ],
      "One suggestion waits in the text; I can't add the 25% since nobody gave it."
    );
    const { text } = await ctx.say(
      chatId,
      composeAgentMessage(
        null,
        "Make the bullets more direct.",
        null,
        null,
        version.id
      ),
      model
    );
    expect(text).toContain("One suggestion waits");
    // The document shows each part's key and the rules to propose.
    const system = systemOf(prompts[0]);
    expect(system).toContain(`[part: ${part}]`);
    expect(system).toContain("propose_change");
    const results = toolResultsOf(prompts[1]);
    expect(results).toContain("documentChangeId");
    expect(results).toContain("neither the profile nor the person gave 25%");
    expect(results).toContain("locked fact");
    expect(results).toContain("ask them first");
    // The page was told of the one that waits.
    const [row, ...others] = await new DocumentsRepository(
      ctx.db
    ).listPendingChanges(version.id);
    expect(others).toHaveLength(0);
    expect(ctx.reported).toEqual([row.id]);
    expect(readChangeContent(ctx.cipher, row)).toMatchObject({
      part,
      find: "Mentored two interns.",
      replace: "Mentored two interns who now ship on their own.",
      reason: "More direct.",
    });
    expect(readChangeContent(ctx.cipher, row).evidenceIds).toHaveLength(1);

    // The next turn knows what waits; a figure the person gives passes.
    const next = agentModel(
      [
        [
          {
            name: "propose_change",
            input: {
              part,
              find: "Cut deploy time by 40% with Kubernetes.",
              replace:
                "Cut deploy time by 40% and costs by 25% with Kubernetes.",
              reason: "Adds the saving you gave.",
            },
          },
        ],
      ],
      "Added."
    );
    await ctx.say(
      chatId,
      composeAgentMessage(
        null,
        "Costs went down 25%, you can add it.",
        null,
        null,
        version.id
      ),
      next.model,
      [{ role: "user", content: "Make the bullets more direct." }]
    );
    expect(systemOf(next.prompts[0])).toContain(
      "Mentored two interns who now ship on their own."
    );
    expect(toolResultsOf(next.prompts[1])).not.toContain("Refused");
    expect(
      await new DocumentsRepository(ctx.db).listPendingChanges(version.id)
    ).toHaveLength(2);

    // A locked fact changes only on the person's request, quoted back.
    const asked = agentModel(
      [
        [
          {
            name: "propose_change",
            input: {
              part: "header",
              find: "Platform Engineer | Kubernetes",
              replace: "Staff Engineer | Kubernetes",
              reason: "The title you asked for.",
              requestedBy: "change my title line to Staff Engineer",
            },
          },
        ],
      ],
      "The new title waits in the text."
    );
    await ctx.say(
      chatId,
      composeAgentMessage(
        null,
        "Please change my title line to Staff Engineer | Kubernetes.",
        null,
        null,
        version.id
      ),
      asked.model,
      [{ role: "user", content: "Make the bullets more direct." }]
    );
    expect(toolResultsOf(asked.prompts[1])).not.toContain("Refused");
    expect(
      await new DocumentsRepository(ctx.db).listPendingChanges(version.id)
    ).toHaveLength(3);
  });

  it("reserves a document agent turn per message and settles it to the usage", async () => {
    const ctx = await setup();
    const { document } = await ctx.insertResume("library");
    const { chatId } = await ctx.chats.current(ctx.user.id, {
      kind: "document",
      documentId: document.id,
    });
    const { turn } = await ctx.say(
      chatId,
      "How does the summary read?",
      agentModel([], "Fine.").model
    );
    expect(turn).not.toBeNull();
    const [task] = await ctx.db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, turn!.taskId));
    expect(task.type).toBe("document_agent_turn");
    expect(task.subjectId).toBe(chatId);
    expect(task.status).toBe("completed");
    const entries = await ctx.db
      .select()
      .from(creditEntriesTable)
      .where(eq(creditEntriesTable.userId, ctx.user.id));
    const charged = entries
      .filter((entry) => entry.taskId === task.id)
      .reduce((sum, entry) => sum + entry.amount, 0);
    // The topic gate's usage: a little, never above the cap.
    expect(charged).toBeLessThan(0);
    expect(-charged).toBeLessThanOrEqual(creditCap("document_agent_turn"));
  });

  it("answers from code when the user has no credits, without a model call", async () => {
    const ctx = await setup({ credits: 0 });
    const { document } = await ctx.insertResume("library");
    const { chatId } = await ctx.chats.current(ctx.user.id, {
      kind: "document",
      documentId: document.id,
    });
    const { model, prompts } = agentModel([], "never");
    const { text, turn } = await ctx.say(chatId, "How does it read?", model);
    expect(turn).toBeNull();
    expect(prompts).toHaveLength(0);
    expect(text).toContain("out of credits");
    expect(text).toContain("Editing the document stays free");
  });

  it("purges a document conversation's messages after 7 days and the chat once its session expired", async () => {
    const ctx = await setup();
    const { document } = await ctx.insertResume("library");
    const repository = new AgentChatRepository(ctx.db);
    const now = Date.now();
    const old = await repository.insertChat({
      userId: ctx.user.id,
      subject: "document",
      documentId: document.id,
      expiresAt: new Date(now - dayMs),
    });
    const live = await repository.insertChat({
      userId: ctx.user.id,
      subject: "document",
      documentId: document.id,
      expiresAt: new Date(now + 3 * dayMs),
    });
    for (const [chat, age] of [
      [old, 8],
      [live, 8],
      [live, 1],
    ] as const) {
      await repository.insertMessage({
        chatId: chat.id,
        messageId: `m-${chat.id}-${age}`,
        position: age,
        encryptedMessage: ctx.cipher.encrypt("{}"),
        createdAt: new Date(now - age * dayMs),
      });
    }
    const messages = await repository.deleteMessagesBefore(
      new Date(now - agentSettings.retentionDays * dayMs)
    );
    const expired = await repository.deleteChatsExpiredBefore(new Date(now));
    expect({ messages, expired }).toEqual({ messages: 2, expired: 1 });
    expect(await repository.listMessages(live.id)).toHaveLength(1);
    expect(await repository.findChat(old.id)).toBeUndefined();
  });
});
