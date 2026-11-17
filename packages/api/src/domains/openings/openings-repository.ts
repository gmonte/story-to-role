import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { applicationsTable } from "@repo/api/domains/applications/db/applications-tables";
import type { DbClient } from "@repo/api/tools/db-client";

import {
  fitCheckItemsTable,
  fitChecksTable,
  openingTermsTable,
  openingsTable,
} from "./db/openings-tables";
import type { OpeningStatus } from "./schemas/opening";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

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
    lackConfirmedAt?: Date | null;
  }) {
    await this.tx
      .update(fitCheckItemsTable)
      .set({
        ...(input.encryptedGapAnswer
          ? { encryptedGapAnswer: input.encryptedGapAnswer }
          : {}),
        ...(input.lackConfirmedAt !== undefined
          ? { lackConfirmedAt: input.lackConfirmedAt }
          : {}),
        answeredAt: new Date(),
      })
      .where(eq(fitCheckItemsTable.id, input.fitCheckItemId));
  }
}
