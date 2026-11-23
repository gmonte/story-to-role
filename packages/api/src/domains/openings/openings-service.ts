import { TRPCError } from "@trpc/server";

import type { AiClient } from "@repo/api/domains/ai/ai-client";
import { smallCallAi } from "@repo/api/domains/ai/small-call-ai";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import {
  getUserCipher,
  type UserCipher,
} from "@repo/api/domains/encryption/user-cipher";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import { loadProfileSource } from "@repo/api/domains/documents/generation/load-profile-source";
import { DocumentsRepository } from "@repo/api/domains/documents/documents-repository";
import { AgentChatRepository } from "@repo/api/domains/agents/agent-chat-repository";
import { getStorage } from "@repo/api/tools/storage/storage";
import { triggerClient } from "@repo/api/tools/trigger/trigger-client";
import { ProfileRepository } from "@repo/api/domains/profile/profile-repository";
import {
  readTargetText,
  suggestLine,
  type SuggestionTarget,
} from "@repo/api/domains/profile/suggestions/suggest-line";
import { ProfileService } from "@repo/api/domains/profile/profile-service";
import type { ProfileLanguage } from "@repo/api/domains/profile/truth/sections";
import { stallGraceMs } from "@repo/api/domains/tasks/task-durations";

import type { openingsTable } from "./db/openings-tables";
import { conditionCategories, type ConditionStance } from "./schemas/opening";
import { rewriteGapAnswer } from "./fit-check/rewrite-gap-answer";
import { OpeningsRepository } from "./openings-repository";
import {
  preferenceConflictsSchema,
  type OpeningDetail,
  type OpeningSummary,
} from "./schemas/opening-view";

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

/** Input limits in code (guided interview spec, guardrail 2). */
export const openingLimits = {
  maxDescriptionCharacters: 30_000,
  minDescriptionCharacters: 200,
  maxNotesCharacters: 4_000,
};

const open = (cipher: UserCipher, value: string | null) =>
  value ? cipher.decrypt(value) : null;

/**
 * Openings from the user's side: added by pasting, by link or with only a
 * company (unsolicited); each is analyzed in a task that receives its id.
 */
export class OpeningsService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db),
    // The AI client for the small calls made outside a task.
    private readonly aiFor: (
      userId: string,
      cipher: UserCipher
    ) => Promise<AiClient> = (userId, cipher) => smallCallAi(db, userId, cipher)
  ) {}

  private async requireProfile(userId: string) {
    const profile = await new CareerRepository(this.db).findProfileByUserId(
      userId
    );
    if (!profile) throw notFound();
    return profile;
  }

  private async create(
    userId: string,
    fields: (
      cipher: UserCipher
    ) => Omit<typeof openingsTable.$inferInsert, "profileId">
  ): Promise<{ openingId: string; realtime: RealtimeSubscription }> {
    const profile = await this.requireProfile(userId);
    // Checked before the opening exists, so none waits on a refused analysis.
    await this.tasks.assertAffordable({ userId, type: "analyze_opening" });
    const opening = await this.db.transaction(async (tx) => {
      const cipher = await getUserCipher(tx, userId);
      return new OpeningsRepository(tx).insertOpening({
        profileId: profile.id,
        ...fields(cipher),
      });
    });
    // An analysis that can't start leaves the opening refused (it can be
    // added again), never "being analyzed" forever.
    const { realtime } = await this.tasks.startOrUndo(
      { userId, type: "analyze_opening", subjectId: opening.id },
      () =>
        new OpeningsRepository(this.db).updateOpening(opening.id, {
          status: "rejected",
        })
    );
    return { openingId: opening.id, realtime };
  }

  createFromText(input: { userId: string; description: string }) {
    const description = input.description.trim();
    if (
      description.length < openingLimits.minDescriptionCharacters ||
      description.length > openingLimits.maxDescriptionCharacters
    ) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }
    return this.create(input.userId, (cipher) => ({
      kind: "posted",
      encryptedDescription: cipher.encrypt(description),
    }));
  }

  createFromLink(input: { userId: string; url: string }) {
    return this.create(input.userId, (cipher) => ({
      kind: "posted",
      encryptedSourceUrl: cipher.encrypt(input.url),
    }));
  }

  /** No vacancy: only the company is required (resume spec). */
  createUnsolicited(input: {
    userId: string;
    company: string;
    role?: string;
    notes?: string;
    link?: string;
  }) {
    return this.create(input.userId, (cipher) => ({
      kind: "unsolicited",
      encryptedCompany: cipher.encrypt(input.company.trim()),
      encryptedTitle: input.role?.trim()
        ? cipher.encrypt(input.role.trim())
        : null,
      encryptedNotes: input.notes?.trim()
        ? cipher.encrypt(input.notes.trim())
        : null,
      encryptedSourceUrl: input.link?.trim()
        ? cipher.encrypt(input.link.trim())
        : null,
    }));
  }

  async list(userId: string): Promise<OpeningSummary[]> {
    const profile = await new CareerRepository(this.db).findProfileByUserId(
      userId
    );
    if (!profile) return [];
    return this.db.transaction(async (tx) => {
      const openings = new OpeningsRepository(tx);
      const cipher = await getUserCipher(tx, userId);
      const rows = await openings.listOpenings(profile.id);
      const fitChecks = await openings.latestFitChecks(
        rows.map((row) => row.id)
      );
      const applications = await openings.applicationStatuses(
        rows.map((row) => row.id)
      );
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        company: open(cipher, row.encryptedCompany),
        title: open(cipher, row.encryptedTitle),
        band:
          fitChecks.find((check) => check.openingId === row.id)?.band ?? null,
        applicationId:
          applications.find((item) => item.openingId === row.id)?.id ?? null,
        applicationStatus:
          applications.find((item) => item.openingId === row.id)?.status ??
          null,
        createdAt: row.createdAt,
      }));
    });
  }

  async get(input: {
    userId: string;
    openingId: string;
  }): Promise<OpeningDetail> {
    const profile = await this.requireProfile(input.userId);
    return this.db.transaction(async (tx) => {
      const openings = new OpeningsRepository(tx);
      const row = await openings.findOpening({
        profileId: profile.id,
        openingId: input.openingId,
      });
      if (!row) throw notFound();
      const cipher = await getUserCipher(tx, input.userId);
      const [fitCheck] = await openings.latestFitChecks([row.id]);

      let items: OpeningDetail["fitCheck"] = null;
      const profiles = new ProfileRepository(tx);
      const [profileDocument, preferencesDocument] = await Promise.all([
        profiles.findDocument(input.userId, "profile"),
        profiles.findDocument(input.userId, "preferences"),
      ]);
      if (fitCheck) {
        const [checkItems, terms] = await Promise.all([
          openings.listFitCheckItems(fitCheck.id),
          openings.listTerms(row.id),
        ]);
        const passages = new Map(
          (
            await profiles.findPassages({
              userId: input.userId,
              passageIds: checkItems.flatMap((item) => item.evidenceIds),
            })
          ).map((passage) => [
            passage.id,
            cipher.decrypt(passage.encryptedText),
          ])
        );
        items = {
          band: fitCheck.band,
          createdAt: fitCheck.createdAt,
          items: checkItems.map((item) => {
            const term = terms.find(
              (candidate) => candidate.id === item.termId
            );
            return {
              id: item.id,
              term: term ? cipher.decrypt(term.encryptedText) : "",
              termKind: term?.kind ?? "keyword",
              category: term?.category ?? "other",
              importance: term?.importance ?? "mandatory",
              verdict: item.verdict,
              explanation: cipher.decrypt(item.encryptedExplanation),
              passages: item.evidenceIds.flatMap((id) =>
                passages.has(id) ? [{ id, text: passages.get(id)! }] : []
              ),
              gapQuestion: open(cipher, item.encryptedGapQuestion),
              gapAnswer: open(cipher, item.encryptedGapAnswer),
              gapLack: !!item.lackConfirmedAt,
              conditionStance: item.conditionStance ?? null,
              gapLinks: item.gapLinks ?? null,
              citesAnswer: item.citesAnswer,
            };
          }),
          preferenceConflicts: fitCheck.encryptedPreferenceConflicts
            ? preferenceConflictsSchema.parse(
                JSON.parse(
                  cipher.decrypt(fitCheck.encryptedPreferenceConflicts)
                )
              )
            : [],
          // The positions and projects of the profile published now: an
          // answer to a gap question can be tied to them.
          ...(await (async () => {
            const source = await loadProfileSource({
              db: tx,
              cipher,
              profileId: profile.id,
            });
            return {
              positions: (source?.positions ?? []).map((position) => ({
                positionId: position.id,
                employer: position.employer,
                title: position.title,
                startDate: position.startDate,
                endDate: position.endDate,
              })),
              projects: (source?.projects ?? []).map((project) => ({
                projectId: project.id,
                name: project.name,
                startDate: project.startDate,
                endDate: project.endDate,
              })),
            };
          })()),
          // An answer saved after the check: its status and totals read
          // the opening before it.
          outdated:
            checkItems.some(
              (item) =>
                !!item.answeredAt && item.answeredAt > fitCheck.createdAt
            ) ||
            (!!row.descriptionEditedAt &&
              row.descriptionEditedAt > fitCheck.createdAt) ||
            (!!profileDocument?.publishedVersionId &&
              (fitCheck.profileVersionId !==
                profileDocument.publishedVersionId ||
                fitCheck.preferencesVersionId !==
                  (preferencesDocument?.publishedVersionId ?? null))),
        };
      }

      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        company: open(cipher, row.encryptedCompany),
        title: open(cipher, row.encryptedTitle),
        band: fitCheck?.band ?? null,
        ...(await applicationOf(openings, row.id)),
        createdAt: row.createdAt,
        description: open(cipher, row.encryptedDescription),
        notes: open(cipher, row.encryptedNotes),
        sourceUrl: open(cipher, row.encryptedSourceUrl),
        progress:
          row.status === "processing"
            ? await new TasksRepository(tx).latestProgress(
                row.id,
                "analyze_opening"
              )
            : null,
        rejectionReason: row.rejectionReason,
        // The last check broke: the fit check shown is the previous one.
        checkFailed: row.status === "analyzed" && row.checkFailedAt !== null,
        language: row.language,
        suggestedTone: row.suggestedTone,
        fitCheck: items,
        warnings: row.warnings,
        needsPublishedProfile:
          row.kind === "posted" && row.status === "analyzed" && !fitCheck,
        profilePublished: !!profileDocument?.publishedVersionId,
      };
    });
  }

  /**
   * Analyzes an opening registered with an external application, once the
   * user wants documents for it: the fit check, at its usual cost.
   */
  async analyzeExternal(input: { userId: string; openingId: string }) {
    const profile = await this.requireProfile(input.userId);
    const row = await new OpeningsRepository(this.db).findOpening({
      profileId: profile.id,
      openingId: input.openingId,
    });
    if (row?.status !== "external") throw notFound();
    if (!row.encryptedDescription && !row.encryptedSourceUrl) {
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    }
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "analyze_opening",
    });
    // Only one request moves it on: a second click analyzes nothing twice.
    const claimed = await new OpeningsRepository(this.db).moveStatus(row.id, {
      from: "external",
      to: "processing",
    });
    if (!claimed) throw new TRPCError({ code: "CONFLICT" });
    return this.tasks.startOrUndo(
      { userId: input.userId, type: "analyze_opening", subjectId: row.id },
      async () => {
        await new OpeningsRepository(this.db).moveStatus(row.id, {
          from: "processing",
          to: "external",
        });
      }
    );
  }

  /**
   * The sweep's part for openings: one still being analyzed when its task
   * already ended, or died, is failed (or keeps its earlier result), so the
   * page never shows it still being read.
   */
  async failStuckAnalyses(now = new Date()) {
    const openings = new OpeningsRepository(this.db);
    // An opening is created a moment before its task: left alone a while.
    const rows = await openings.listStuckAnalyses(
      new Date(now.getTime() - stallGraceMs)
    );
    for (const row of rows) await openings.failAnalysis(row.id);
  }

  /**
   * Analyzes again, from the start and at its usual cost, an opening whose
   * analysis failed.
   */
  async retryAnalysis(input: { userId: string; openingId: string }) {
    const profile = await this.requireProfile(input.userId);
    const openings = new OpeningsRepository(this.db);
    const row = await openings.findOpening({
      profileId: profile.id,
      openingId: input.openingId,
    });
    if (row?.status !== "failed") throw notFound();
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "analyze_opening",
    });
    // Only one request moves it on: a second click analyzes nothing twice.
    const claimed = await openings.moveStatus(row.id, {
      from: "failed",
      to: "processing",
    });
    if (!claimed) throw new TRPCError({ code: "CONFLICT" });
    return this.tasks.startOrUndo(
      { userId: input.userId, type: "analyze_opening", subjectId: row.id },
      async () => {
        await openings.moveStatus(row.id, {
          from: "processing",
          to: "failed",
        });
      }
    );
  }

  /**
   * Runs the fit check again on an analyzed opening, at its usual cost: the
   * profile was published (or published again) since the last one.
   */
  async reanalyze(input: { userId: string; openingId: string }) {
    const profile = await this.requireProfile(input.userId);
    const row = await new OpeningsRepository(this.db).findOpening({
      profileId: profile.id,
      openingId: input.openingId,
    });
    if (row?.status !== "analyzed" || row.kind !== "posted") throw notFound();
    // Nothing to check against until a profile is published.
    const published = await new ProfileRepository(this.db).findDocument(
      input.userId,
      "profile"
    );
    if (!published?.publishedVersionId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Publish your profile before running the fit check.",
      });
    }
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "analyze_opening",
    });
    // Only one request moves it on: a second click analyzes nothing twice.
    const claimed = await new OpeningsRepository(this.db).moveStatus(row.id, {
      from: "analyzed",
      to: "processing",
    });
    if (!claimed) throw new TRPCError({ code: "CONFLICT" });
    return this.tasks.startOrUndo(
      { userId: input.userId, type: "analyze_opening", subjectId: row.id },
      async () => {
        await new OpeningsRepository(this.db).moveStatus(row.id, {
          from: "processing",
          to: "analyzed",
        });
      }
    );
  }

  /**
   * Excludes the opening's company in the user's job preferences (profile
   * spec, "Job preferences"): screening counts it from now on.
   */
  async excludeCompany(input: {
    userId: string;
    openingId: string;
    date: string;
    language: ProfileLanguage;
  }) {
    const profile = await this.requireProfile(input.userId);
    const row = await new OpeningsRepository(this.db).findOpening({
      profileId: profile.id,
      openingId: input.openingId,
    });
    if (!row) throw notFound();
    const cipher = await getUserCipher(this.db, input.userId);
    const company = open(cipher, row.encryptedCompany);
    if (!company) throw new TRPCError({ code: "PRECONDITION_FAILED" });
    await new ProfileService(this.db, this.tasks).excludeCompany({
      userId: input.userId,
      company,
      date: input.date,
      language: input.language,
    });
    return { company };
  }

  /** The user can close an opening (the company has no vacancies…) and reopen it. */
  async setClosed(input: {
    userId: string;
    openingId: string;
    closed: boolean;
  }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const openings = new OpeningsRepository(tx);
      const row = await openings.findOpening({
        profileId: profile.id,
        openingId: input.openingId,
      });
      // An external opening was never analyzed: its application closes.
      if (
        !row ||
        row.status === "processing" ||
        row.status === "failed" ||
        row.status === "rejected" ||
        row.status === "external"
      )
        throw notFound();
      await openings.updateOpening(row.id, {
        status: input.closed ? "closed" : "analyzed",
        closedAt: input.closed ? new Date() : null,
      });
    });
  }

  /**
   * Deletes the opening and everything that is its: the application, its
   * documents with every version, the answers, research and instructions.
   * Final, so the UI confirms. The documents' cached PDFs and agent
   * conversations go afterwards, best effort.
   */
  async deleteOpening(input: { userId: string; openingId: string }) {
    const profile = await this.requireProfile(input.userId);
    const { renderedKeys, chatIds } = await this.db.transaction(async (tx) => {
      const openings = new OpeningsRepository(tx);
      const row = await openings.findOpening({
        profileId: profile.id,
        openingId: input.openingId,
      });
      if (!row) throw notFound();
      const documents = new DocumentsRepository(tx);
      const application = await documents.findApplicationByOpening(row.id);
      const owned = application
        ? await documents.listApplicationDocuments(application.id)
        : [];
      const chats = new AgentChatRepository(tx);
      const keys: string[] = [];
      const chatIds: string[] = [];
      for (const document of owned) {
        keys.push(...(await documents.renderedKeysOfDocument(document.id)));
        chatIds.push(...(await chats.listChatIdsOfDocument(document.id)));
      }
      await openings.deleteOpening(row.id);
      return { renderedKeys: keys, chatIds };
    });
    if (renderedKeys.length > 0) {
      const storage = getStorage();
      await Promise.all(
        renderedKeys.map((key) => storage.delete(key).catch(() => undefined))
      );
    }
    await Promise.all(
      chatIds.map(async (chatId) => {
        await triggerClient.cancelChatRuns(chatId).catch(() => undefined);
        await triggerClient
          .closeSession(chatId, "opening deleted")
          .catch(() => undefined);
      })
    );
    return { openingId: input.openingId };
  }

  /** The description is the user's to edit; nothing runs again by itself. */
  async updateDescription(input: {
    userId: string;
    openingId: string;
    description: string;
  }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const openings = new OpeningsRepository(tx);
      const row = await openings.findOpening({
        profileId: profile.id,
        openingId: input.openingId,
      });
      if (!row) throw notFound();
      const description = input.description.trim();
      const cipher = await getUserCipher(tx, input.userId);
      await openings.updateOpening(row.id, {
        encryptedDescription: description ? cipher.encrypt(description) : null,
        descriptionEditedAt: new Date(),
      });
    });
  }

  /** The title is shortened by the AI and editable by the user. */
  async rename(input: {
    userId: string;
    openingId: string;
    title: string;
    company?: string;
    sourceUrl?: string | null;
  }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const openings = new OpeningsRepository(tx);
      const row = await openings.findOpening({
        profileId: profile.id,
        openingId: input.openingId,
      });
      if (!row) throw notFound();
      const cipher = await getUserCipher(tx, input.userId);
      await openings.updateOpening(row.id, {
        encryptedTitle: cipher.encrypt(input.title.trim()),
        ...(input.company?.trim()
          ? { encryptedCompany: cipher.encrypt(input.company.trim()) }
          : {}),
        ...(input.sourceUrl !== undefined
          ? {
              encryptedSourceUrl: input.sourceUrl
                ? cipher.encrypt(input.sourceUrl)
                : null,
            }
          : {}),
      });
    });
  }

  /** The answer as the sentence to propose for a target (or the answer). */
  private async sentenceFor(input: {
    cipher: UserCipher;
    careerProfileId: string;
    userId: string;
    target: SuggestionTarget;
    requirement: string;
    question: string;
    answer: string;
  }) {
    try {
      const { language, existing } = await readTargetText({
        db: this.db,
        cipher: input.cipher,
        userId: input.userId,
        careerProfileId: input.careerProfileId,
        target: input.target,
      });
      return await rewriteGapAnswer({
        ai: await this.aiFor(input.userId, input.cipher),
        requirement: input.requirement,
        question: input.question,
        answer: input.answer,
        existing,
        language,
      });
    } catch {
      return input.answer;
    }
  }

  /**
   * The answer to a gap question (resume spec, "Gap questions"). "I have
   * it": a story, kept with the opening (an application instruction) and
   * proposed as a line under what the user did in each position or project
   * they tie it to, or under Professional identity when it is tied to none.
   * "I don't have it": a suggestion under Known gaps, in the user's words
   * or as the requirement. Nothing changes until the user accepts it in My
   * career.
   */
  async answerGapQuestion(input: {
    userId: string;
    fitCheckItemId: string;
    answer?: string;
    lacks?: boolean;
    positionIds?: string[];
    projectIds?: string[];
    notTied?: boolean;
  }): Promise<{ profileSuggestionIds: string[] }> {
    const profile = await this.requireProfile(input.userId);
    const answer = input.answer?.trim();
    const positionIds = input.lacks ? [] : [...new Set(input.positionIds)];
    const projectIds = input.lacks ? [] : [...new Set(input.projectIds)];
    if (!input.lacks) {
      // A story, and where it happened (or that it was general).
      if (
        !answer ||
        (!positionIds.length && !projectIds.length && !input.notTied)
      ) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
    }
    const { item, openingId } = await this.db.transaction(async (tx) => {
      const openings = new OpeningsRepository(tx);
      const found = await openings.findFitCheckItem(input.fitCheckItemId);
      const opening =
        found &&
        (await openings.findOpening({
          profileId: profile.id,
          openingId: found.openingId,
        }));
      // Any gap or partial card can be answered, with or without a question
      // (a declared gap has none); a condition has its own answer.
      if (!found || !opening || found.item.verdict === "met") throw notFound();
      if (!input.lacks) {
        const cipher = await getUserCipher(tx, input.userId);
        await openings.answerFitCheckItem({
          fitCheckItemId: found.item.id,
          encryptedGapAnswer: cipher.encrypt(answer!),
          gapLinks: { positionIds, projectIds, notTied: !!input.notTied },
          lackConfirmedAt: null,
          conditionStance: null,
        });
      }
      return { item: found.item, openingId: opening.id };
    });

    const cipher = await getUserCipher(this.db, input.userId);
    const openings = new OpeningsRepository(this.db);
    const propose = async (
      target: SuggestionTarget,
      text: string | Record<"en-US" | "pt-BR", string>,
      reason: Record<"en-US" | "pt-BR", string>,
      fallback?: SuggestionTarget
    ) => {
      try {
        const { profileSuggestionId } = await suggestLine({
          db: this.db,
          cipher,
          userId: input.userId,
          careerProfileId: profile.id,
          target,
          fallback,
          text,
          reason,
        });
        return profileSuggestionId;
      } catch (error) {
        // The profile already says it: nothing to suggest.
        if (error instanceof TRPCError && error.code === "CONFLICT") {
          return null;
        }
        throw error;
      }
    };

    if (!input.lacks) {
      const reason = {
        "en-US":
          "You said you have this when answering an opening's gap question.",
        "pt-BR":
          "Você disse que tem isto ao responder a pergunta de lacuna de uma vaga.",
      };
      const targets: SuggestionTarget[] = [
        ...positionIds.map((positionId): SuggestionTarget => ({
          kind: "experience",
          positionId,
          field: "responsibilities",
        })),
        ...projectIds.map((projectId): SuggestionTarget => ({
          kind: "project",
          projectId,
          field: "responsibilities",
        })),
        ...(input.notTied ? [{ kind: "identityAreas" } as const] : []),
      ];
      const term = (await openings.listTerms(openingId)).find(
        (row) => row.id === item.termId
      );
      const requirement = term ? cipher.decrypt(term.encryptedText) : "";
      const question = item.encryptedGapQuestion
        ? cipher.decrypt(item.encryptedGapQuestion)
        : requirement;
      const ids: string[] = [];
      for (const target of targets) {
        // The answer is the user's own words, kept as they are with the
        // opening; the profile gets it as one sentence that stands alone,
        // appended to the end of the field's text.
        const sentence = await this.sentenceFor({
          cipher,
          careerProfileId: profile.id,
          userId: input.userId,
          target,
          requirement,
          question,
          answer: answer!,
        });
        const id = await propose(
          target.kind === "experience" || target.kind === "project"
            ? { ...target, append: true }
            : target,
          sentence,
          reason,
          // An entry the draft no longer has: the fact still has a place.
          target.kind === "identityAreas"
            ? undefined
            : { kind: "identityAreas" }
        );
        if (id && !ids.includes(id)) ids.push(id);
      }
      return { profileSuggestionIds: ids };
    }

    const term = (await openings.listTerms(openingId)).find(
      (row) => row.id === item.termId
    );
    if (!term) throw notFound();
    const requirement = cipher.decrypt(term.encryptedText);
    const id = await propose(
      { kind: "section", section: "gaps" },
      answer ?? {
        "en-US": `No experience with ${requirement}`,
        "pt-BR": `Não tenho experiência com ${requirement}`,
      },
      {
        "en-US":
          "You confirmed you really lack this when answering an opening's gap question.",
        "pt-BR":
          "Você confirmou que realmente não tem isto ao responder a pergunta de lacuna de uma vaga.",
      }
    );
    await openings.answerFitCheckItem({
      fitCheckItemId: item.id,
      lackConfirmedAt: new Date(),
      conditionStance: null,
    });
    return { profileSuggestionIds: id ? [id] : [] };
  }

  /** Takes back the answer to a condition (the check reads as outdated). */
  async undoConditionAnswer(input: { userId: string; fitCheckItemId: string }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const openings = new OpeningsRepository(tx);
      const found = await openings.findFitCheckItem(input.fitCheckItemId);
      const opening =
        found &&
        (await openings.findOpening({
          profileId: profile.id,
          openingId: found.openingId,
        }));
      if (!found || !opening || !found.item.conditionStance) throw notFound();
      await openings.clearCondition(found.item.id);
    });
  }

  /**
   * Answers a condition requirement (work model, schedule, location,
   * travel…): the user meets it, doesn't but it is no blocker, or it is a
   * blocker. The note is optional. For a blocker, the user can add it to
   * the job preferences as a discard rule. Nothing re-runs: the check reads
   * as outdated until the user checks again.
   */
  async answerCondition(input: {
    userId: string;
    fitCheckItemId: string;
    stance: ConditionStance;
    note?: string;
    addToPreferences?: boolean;
    language: ProfileLanguage;
  }): Promise<{ preferenceRule: string | null }> {
    const profile = await this.requireProfile(input.userId);
    const note = input.note?.trim() ?? "";
    const cipher = await getUserCipher(this.db, input.userId);
    const requirement = await this.db.transaction(async (tx) => {
      const openings = new OpeningsRepository(tx);
      const found = await openings.findFitCheckItem(input.fitCheckItemId);
      const opening =
        found &&
        (await openings.findOpening({
          profileId: profile.id,
          openingId: found.openingId,
        }));
      if (!found || !opening || found.item.verdict === "met") throw notFound();
      const term = (await openings.listTerms(opening.id)).find(
        (row) => row.id === found.item.termId
      );
      if (!term || !conditionCategories.includes(term.category)) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      await openings.answerCondition({
        fitCheckItemId: found.item.id,
        conditionStance: input.stance,
        encryptedNote: note ? cipher.encrypt(note) : null,
      });
      return cipher.decrypt(term.encryptedText);
    });
    if (input.stance !== "blocker" || !input.addToPreferences) {
      return { preferenceRule: null };
    }
    const rule = await new ProfileService(this.db, this.tasks).addDiscardRule({
      userId: input.userId,
      text: note ? `${requirement}: ${note}` : requirement,
      language: input.language,
    });
    return { preferenceRule: rule.text };
  }
}

/** The opening's application in the tracker, if it has one. */
async function applicationOf(openings: OpeningsRepository, openingId: string) {
  const [application] = await openings.applicationStatuses([openingId]);
  return {
    applicationId: application?.id ?? null,
    applicationStatus: application?.status ?? null,
  };
}
