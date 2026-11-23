import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  notExists,
  or,
  sql,
} from "drizzle-orm";

import { applicationsTable } from "@repo/api/domains/applications/db/applications-tables";
import { tasksTable } from "@repo/api/domains/tasks/db/tasks-tables";
import type { DbClient } from "@repo/api/tools/db-client";

import {
  fitCheckItemsTable,
  fitChecksTable,
  openingTermsTable,
  openingsTable,
} from "./db/openings-tables";
import type { ConditionStance, OpeningStatus } from "./schemas/opening";
import type { GapLinks } from "./schemas/opening-view";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

/** Edited after it was last read (or never read since it was edited). */
export const isDescriptionUnread = (dates: {
  editedAt: Date | null;
  readAt: Date | null;
}) =>
  dates.editedAt !== null &&
  (dates.readAt === null || dates.editedAt > dates.readAt);

export class OpeningsRepository {
  constructor(private readonly tx: DbClient) {}

  async insertOpening(opening: Insert<typeof openingsTable>) {
    const [row] = await this.tx
      .insert(openingsTable)
      .values(opening)
      .returning();
    return row;
  }

  async findOpening(input: { profileId: string; openingId: string }) {
    const [row] = await this.tx
      .select()
      .from(openingsTable)
      .where(
        and(
          eq(openingsTable.id, input.openingId),
          eq(openingsTable.profileId, input.profileId)
        )
      );
    return row;
  }

  /** Holds the opening's row until the transaction ends. */
  async lockOpening(openingId: string) {
    await this.tx
      .select({ id: openingsTable.id })
      .from(openingsTable)
      .where(eq(openingsTable.id, openingId))
      .for("update");
  }

  async findOpeningById(openingId: string) {
    const [row] = await this.tx
      .select()
      .from(openingsTable)
      .where(eq(openingsTable.id, openingId));
    return row;
  }

  /** The application of each opening that has one, with its status. */
  async applicationStatuses(openingIds: string[]) {
    if (openingIds.length === 0) return [];
    return this.tx
      .select({
        id: applicationsTable.id,
        openingId: applicationsTable.openingId,
        status: applicationsTable.status,
      })
      .from(applicationsTable)
      .where(inArray(applicationsTable.openingId, openingIds));
  }

  listOpenings(profileId: string) {
    return this.tx
      .select()
      .from(openingsTable)
      .where(eq(openingsTable.profileId, profileId))
      .orderBy(desc(openingsTable.createdAt));
  }

  /** Moves the status only if it is still `from`. Whether it moved. */
  async moveStatus(
    openingId: string,
    input: { from: OpeningStatus; to: OpeningStatus }
  ) {
    const moved = await this.tx
      .update(openingsTable)
      .set({ status: input.to })
      .where(
        and(
          eq(openingsTable.id, openingId),
          eq(openingsTable.status, input.from)
        )
      )
      .returning({ id: openingsTable.id });
    return moved.length > 0;
  }

  /**
   * Ends an analysis that broke. An opening analyzed before (it has its
   * vector) keeps that result, as only the new check failed; one never
   * analyzed is failed, for the user to try again.
   */
  async failAnalysis(openingId: string) {
    await this.tx
      .update(openingsTable)
      .set({
        status: sql`case when ${openingsTable.embedding} is null then 'failed' else 'analyzed' end`,
        checkFailedAt: sql`case when ${openingsTable.embedding} is null then null else now() end`,
      })
      .where(
        and(
          eq(openingsTable.id, openingId),
          eq(openingsTable.status, "processing")
        )
      );
  }

  /**
   * Openings still being analyzed, last changed before `before`, with no
   * analysis task pending or running: their run died without a word.
   */
  async listStuckAnalyses(before: Date) {
    return this.tx
      .select({ id: openingsTable.id })
      .from(openingsTable)
      .where(
        and(
          eq(openingsTable.status, "processing"),
          // Compared column by column: a bare SQL expression leaves the
          // date unmapped, which the Postgres driver refuses.
          or(
            lt(openingsTable.updatedAt, before),
            and(
              isNull(openingsTable.updatedAt),
              lt(openingsTable.createdAt, before)
            )
          ),
          notExists(
            this.tx
              .select({ id: tasksTable.id })
              .from(tasksTable)
              .where(
                and(
                  eq(tasksTable.subjectId, openingsTable.id),
                  eq(tasksTable.type, "analyze_opening"),
                  inArray(tasksTable.status, ["pending", "processing"])
                )
              )
          )
        )
      );
  }

  /** Deletes the opening; its application, documents and checks cascade. */
  async deleteOpening(openingId: string) {
    await this.tx.delete(openingsTable).where(eq(openingsTable.id, openingId));
  }

  async updateOpening(
    openingId: string,
    changes: Partial<Insert<typeof openingsTable>>
  ) {
    await this.tx
      .update(openingsTable)
      .set(changes)
      .where(eq(openingsTable.id, openingId));
  }

  async replaceTerms(
    openingId: string,
    terms: Array<Insert<typeof openingTermsTable>>
  ) {
    await this.tx
      .delete(openingTermsTable)
      .where(eq(openingTermsTable.openingId, openingId));
    if (terms.length === 0) return [];
    return this.tx.insert(openingTermsTable).values(terms).returning();
  }

  /**
   * Whether the description was edited after it was last read: until it is
   * read again, its keywords and requirements (and the fit check judged on
   * them) belong to the old text, and nothing matches against them.
   */
  async descriptionUnread(openingId: string) {
    const [row] = await this.tx
      .select({
        editedAt: openingsTable.descriptionEditedAt,
        readAt: openingsTable.descriptionReadAt,
      })
      .from(openingsTable)
      .where(eq(openingsTable.id, openingId));
    return isDescriptionUnread(row ?? { editedAt: null, readAt: null });
  }

  /** The keywords and requirements read from the description as it is now. */
  async listCurrentTerms(openingId: string) {
    return (await this.descriptionUnread(openingId))
      ? []
      : this.listTerms(openingId);
  }

  async insertTerms(terms: Array<Insert<typeof openingTermsTable>>) {
    if (terms.length === 0) return [];
    return this.tx.insert(openingTermsTable).values(terms).returning();
  }

  async updateTerm(
    termId: string,
    changes: Partial<Insert<typeof openingTermsTable>>
  ) {
    await this.tx
      .update(openingTermsTable)
      .set(changes)
      .where(eq(openingTermsTable.id, termId));
  }

  /** Removes terms, and the fit check items and answers judged on them. */
  async deleteTerms(termIds: string[]) {
    if (termIds.length === 0) return;
    await this.tx
      .delete(openingTermsTable)
      .where(inArray(openingTermsTable.id, termIds));
  }

  listTerms(openingId: string) {
    return this.tx
      .select()
      .from(openingTermsTable)
      .where(eq(openingTermsTable.openingId, openingId))
      .orderBy(asc(openingTermsTable.createdAt), asc(openingTermsTable.id));
  }

  async insertFitCheck(input: {
    openingId: string;
    band: Insert<typeof fitChecksTable>["band"];
    profileVersionId?: string | null;
    preferencesVersionId?: string | null;
    encryptedPreferenceConflicts?: string | null;
    items: Array<Omit<Insert<typeof fitCheckItemsTable>, "fitCheckId">>;
  }) {
    const { items: _items, ...fitCheckRow } = input;
    const [fitCheck] = await this.tx
      .insert(fitChecksTable)
      .values(fitCheckRow)
      .returning();
    if (input.items.length > 0) {
      await this.tx
        .insert(fitCheckItemsTable)
        .values(
          input.items.map((item) => ({ ...item, fitCheckId: fitCheck.id }))
        );
    }
    return fitCheck;
  }

  async latestFitChecks(openingIds: string[]) {
    if (openingIds.length === 0) return [];
    const rows = await this.tx
      .select()
      .from(fitChecksTable)
      .where(inArray(fitChecksTable.openingId, openingIds))
      .orderBy(desc(fitChecksTable.createdAt));
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latest.has(row.openingId)) latest.set(row.openingId, row);
    }
    return [...latest.values()];
  }

  listFitCheckItems(fitCheckId: string) {
    return this.tx
      .select()
      .from(fitCheckItemsTable)
      .where(eq(fitCheckItemsTable.fitCheckId, fitCheckId))
      .orderBy(asc(fitCheckItemsTable.createdAt), asc(fitCheckItemsTable.id));
  }

  async findFitCheckItem(fitCheckItemId: string) {
    const [row] = await this.tx
      .select({ item: fitCheckItemsTable, openingId: fitChecksTable.openingId })
      .from(fitCheckItemsTable)
      .innerJoin(
        fitChecksTable,
        eq(fitChecksTable.id, fitCheckItemsTable.fitCheckId)
      )
      .where(eq(fitCheckItemsTable.id, fitCheckItemId));
    return row;
  }

  /**
   * Records what the user decided about a gap: an answer (a story), or
   * that they really lack it.
   */
  async answerFitCheckItem(input: {
    fitCheckItemId: string;
    encryptedGapAnswer?: string;
    gapLinks?: GapLinks;
    lackConfirmedAt?: Date | null;
    conditionStance?: ConditionStance | null;
  }) {
    await this.tx
      .update(fitCheckItemsTable)
      .set({
        ...(input.encryptedGapAnswer
          ? { encryptedGapAnswer: input.encryptedGapAnswer }
          : {}),
        ...(input.gapLinks ? { gapLinks: input.gapLinks } : {}),
        ...(input.lackConfirmedAt !== undefined
          ? { lackConfirmedAt: input.lackConfirmedAt }
          : {}),
        ...(input.conditionStance !== undefined
          ? { conditionStance: input.conditionStance }
          : {}),
        answeredAt: new Date(),
      })
      .where(eq(fitCheckItemsTable.id, input.fitCheckItemId));
  }

  /** Takes back the user's answer to a condition. */
  async clearCondition(fitCheckItemId: string) {
    await this.tx
      .update(fitCheckItemsTable)
      .set({
        conditionStance: null,
        encryptedGapAnswer: null,
        answeredAt: new Date(),
      })
      .where(eq(fitCheckItemsTable.id, fitCheckItemId));
  }

  /** Records how the user stands on a condition; the note is optional. */
  async answerCondition(input: {
    fitCheckItemId: string;
    conditionStance: ConditionStance;
    encryptedNote: string | null;
  }) {
    await this.tx
      .update(fitCheckItemsTable)
      .set({
        conditionStance: input.conditionStance,
        encryptedGapAnswer: input.encryptedNote,
        gapLinks: null,
        lackConfirmedAt: null,
        answeredAt: new Date(),
      })
      .where(eq(fitCheckItemsTable.id, input.fitCheckItemId));
  }
}
