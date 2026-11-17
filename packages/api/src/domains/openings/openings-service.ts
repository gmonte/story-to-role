import { TRPCError } from "@trpc/server";

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
import { ProfileRepository } from "@repo/api/domains/profile/profile-repository";
import {
  suggestLine,
  type SuggestionTarget,
} from "@repo/api/domains/profile/suggestions/suggest-line";
import { ProfileService } from "@repo/api/domains/profile/profile-service";
import type { ProfileLanguage } from "@repo/api/domains/profile/truth/sections";

import type { openingsTable } from "./db/openings-tables";
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
    private readonly tasks = new TasksService(db)
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
            };
          }),
          preferenceConflicts: fitCheck.encryptedPreferenceConflicts
            ? preferenceConflictsSchema.parse(
                JSON.parse(
                  cipher.decrypt(fitCheck.encryptedPreferenceConflicts)
                )
              )
            : [],
          // The positions a confirmed gap can be tied to: those of the
          // profile published now (“what I did not do” is per position).
          positions: (
            (await loadProfileSource({ db: tx, cipher, profileId: profile.id }))
              ?.positions ?? []
          ).map((position) => ({
            positionId: position.id,
            employer: position.employer,
            title: position.title,
            startDate: position.startDate,
            endDate: position.endDate,
          })),
          outdated:
            !!profileDocument?.publishedVersionId &&
            (fitCheck.profileVersionId !== profileDocument.publishedVersionId ||
              fitCheck.preferencesVersionId !==
                (preferencesDocument?.publishedVersionId ?? null)),
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

  /** The title is shortened by the AI and editable by the user. */
  async rename(input: {
    userId: string;
    openingId: string;
    title: string;
    company?: string;
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
      });
    });
  }

  /**
   * The answer to a gap question (resume spec, "Gap questions"): either a
   * story, kept with the opening and turned into an application
   * instruction when it is split; or the user confirming they really lack
   * it, which becomes a suggestion in the profile's draft: under "what I
   * did not do" of the position the user names, else under Known gaps. Nothing changes until the user accepts it there.
   */
  async answerGapQuestion(input: {
    userId: string;
    fitCheckItemId: string;
    answer?: string;
    lacks?: boolean;
    positionId?: string;
  }): Promise<{ profileSuggestionId: string | null }> {
    const profile = await this.requireProfile(input.userId);
    const answer = input.answer?.trim();
    if (!input.lacks && !answer) throw new TRPCError({ code: "BAD_REQUEST" });
    const { item, openingId } = await this.db.transaction(async (tx) => {
      const openings = new OpeningsRepository(tx);
      const found = await openings.findFitCheckItem(input.fitCheckItemId);
      const opening =
        found &&
        (await openings.findOpening({
          profileId: profile.id,
          openingId: found.openingId,
        }));
      if (!found?.item.encryptedGapQuestion || !opening) throw notFound();
      if (!input.lacks) {
        const cipher = await getUserCipher(tx, input.userId);
        await openings.answerFitCheckItem({
          fitCheckItemId: found.item.id,
          encryptedGapAnswer: cipher.encrypt(answer!),
          lackConfirmedAt: null,
        });
      }
      return { item: found.item, openingId: opening.id };
    });
    if (!input.lacks) return { profileSuggestionId: null };

    const cipher = await getUserCipher(this.db, input.userId);
    const openings = new OpeningsRepository(this.db);
    const term = (await openings.listTerms(openingId)).find(
      (row) => row.id === item.termId
    );
    if (!term) throw notFound();
    const text = cipher.decrypt(term.encryptedText);
    const known: SuggestionTarget = { kind: "section", section: "gaps" };
    let profileSuggestionId: string | null = null;
    try {
      ({ profileSuggestionId } = await suggestLine({
        db: this.db,
        cipher,
        userId: input.userId,
        careerProfileId: profile.id,
        target: input.positionId
          ? {
              kind: "experience",
              positionId: input.positionId,
              field: "notDone",
            }
          : known,
        text,
        reason: {
          "en-US":
            "You confirmed you really lack this when answering an opening's gap question.",
          "pt-BR":
            "Você confirmou que realmente não tem isto ao responder a pergunta de lacuna de uma vaga.",
        },
      }));
    } catch (error) {
      // The profile already says it: nothing to suggest.
      if (!(error instanceof TRPCError && error.code === "CONFLICT")) {
        throw error;
      }
    }
    await openings.answerFitCheckItem({
      fitCheckItemId: item.id,
      lackConfirmedAt: new Date(),
    });
    return { profileSuggestionId };
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
