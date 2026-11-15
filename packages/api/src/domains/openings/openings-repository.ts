import {
  and,
  asc,
  cosineDistance,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
} from "drizzle-orm";

import { positionsTable } from "@repo/api/domains/career/db/career-tables";
import { evidenceTable } from "@repo/api/domains/evidence/db/evidence-tables";
import type { DbClient } from "@repo/api/tools/db-client";

import {
  fitCheckItemsTable,
  fitChecksTable,
  openingTermsTable,
  openingsTable,
} from "./db/openings-tables";

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

  listOpenings(profileId: string) {
    return this.tx
      .select()
      .from(openingsTable)
      .where(eq(openingsTable.profileId, profileId))
      .orderBy(desc(openingsTable.createdAt));
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
    items: Array<Omit<Insert<typeof fitCheckItemsTable>, "fitCheckId">>;
  }) {
    const [fitCheck] = await this.tx
      .insert(fitChecksTable)
      .values({ openingId: input.openingId, band: input.band })
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

  async answerFitCheckItem(input: {
    fitCheckItemId: string;
    encryptedGapAnswer: string;
  }) {
    await this.tx
      .update(fitCheckItemsTable)
      .set({
        encryptedGapAnswer: input.encryptedGapAnswer,
        answeredAt: new Date(),
      })
      .where(eq(fitCheckItemsTable.id, input.fitCheckItemId));
  }

  /** Approved evidence without a vector yet. */
  listEvidenceWithoutEmbedding(profileId: string) {
    return this.tx
      .select({
        id: evidenceTable.id,
        encryptedText: evidenceTable.encryptedText,
      })
      .from(evidenceTable)
      .where(
        and(
          eq(evidenceTable.profileId, profileId),
          isNull(evidenceTable.embedding)
        )
      );
  }

  async setEvidenceEmbedding(input: {
    evidenceId: string;
    embedding: number[];
  }) {
    await this.tx
      .update(evidenceTable)
      .set({ embedding: input.embedding })
      .where(eq(evidenceTable.id, input.evidenceId));
  }

  /**
   * The user's evidence closest to a vector (cosine), skipping evidence of
   * removed positions: retrieval for one fit check term.
   */
  nearestEvidence(input: {
    profileId: string;
    embedding: number[];
    limit: number;
  }) {
    const distance = cosineDistance(evidenceTable.embedding, input.embedding);
    return this.tx
      .select({
        id: evidenceTable.id,
        kind: evidenceTable.kind,
        encryptedText: evidenceTable.encryptedText,
        positionId: evidenceTable.positionId,
        distance,
      })
      .from(evidenceTable)
      .leftJoin(positionsTable, eq(positionsTable.id, evidenceTable.positionId))
      .where(
        and(
          eq(evidenceTable.profileId, input.profileId),
          isNotNull(evidenceTable.embedding),
          or(
            isNull(evidenceTable.positionId),
            ne(positionsTable.status, "removed")
          )
        )
      )
      .orderBy(distance)
      .limit(input.limit);
  }
}
