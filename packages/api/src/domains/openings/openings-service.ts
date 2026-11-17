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

import type { openingsTable } from "./db/openings-tables";
import { OpeningsRepository } from "./openings-repository";
import type { OpeningDetail, OpeningSummary } from "./schemas/opening-view";

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
      if (fitCheck) {
        const [checkItems, terms] = await Promise.all([
          openings.listFitCheckItems(fitCheck.id),
          openings.listTerms(row.id),
        ]);
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
              verdict: item.verdict,
              explanation: cipher.decrypt(item.encryptedExplanation),
              // Profile_truth replaces this in P5 (docs/plan.md): the
              // passage backing each requirement.
              evidence: [],
              gapQuestion: open(cipher, item.encryptedGapQuestion),
              gapAnswer: open(cipher, item.encryptedGapAnswer),
            };
          }),
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
   * The answer to a gap question: kept with the opening, it becomes an
   * application instruction when the application starts (slice 4).
   */
  async answerGapQuestion(input: {
    userId: string;
    fitCheckItemId: string;
    answer: string;
  }) {
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
      if (!found?.item.encryptedGapQuestion || !opening) throw notFound();
      const cipher = await getUserCipher(tx, input.userId);
      await openings.answerFitCheckItem({
        fitCheckItemId: found.item.id,
        encryptedGapAnswer: cipher.encrypt(input.answer.trim()),
      });
    });
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
