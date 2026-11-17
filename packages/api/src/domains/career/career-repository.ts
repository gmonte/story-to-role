import {
  and,
  arrayContains,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";

import { openingsTable } from "@repo/api/domains/openings/db/openings-tables";
import type { DbClient } from "@repo/api/tools/db-client";

import {
  careerProfilesTable,
  credentialsTable,
  positionsTable,
  sourceDocumentsTable,
} from "./db/career-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class CareerRepository {
  constructor(private readonly tx: DbClient) {}

  async findProfileByUserId(userId: string) {
    const [row] = await this.tx
      .select()
      .from(careerProfilesTable)
      .where(eq(careerProfilesTable.userId, userId));
    return row;
  }

  /** Whether the profile has an opening yet. */
  async hasOpening(profileId: string) {
    const rows = await this.tx
      .select({ id: openingsTable.id })
      .from(openingsTable)
      .where(eq(openingsTable.profileId, profileId))
      .limit(1);
    return rows.length > 0;
  }

  /** Whether the profile holds anything yet: a source, a position or an opening. */
  async hasStarted(profileId: string) {
    const first = (
      table:
        | typeof sourceDocumentsTable
        | typeof positionsTable
        | typeof openingsTable
    ) =>
      this.tx
        .select({ id: table.id })
        .from(table)
        .where(eq(table.profileId, profileId))
        .limit(1);
    const found = await Promise.all([
      first(sourceDocumentsTable),
      first(positionsTable),
      first(openingsTable),
    ]);
    return found.some((rows) => rows.length > 0);
  }

  async findProfileById(profileId: string) {
    const [row] = await this.tx
      .select()
      .from(careerProfilesTable)
      .where(eq(careerProfilesTable.id, profileId));
    return row;
  }

  async insertProfileIfMissing(profile: Insert<typeof careerProfilesTable>) {
    await this.tx
      .insert(careerProfilesTable)
      .values(profile)
      .onConflictDoNothing({ target: careerProfilesTable.userId });
  }

  async updateProfile(
    profileId: string,
    changes: Partial<Insert<typeof careerProfilesTable>>
  ) {
    await this.tx
      .update(careerProfilesTable)
      .set(changes)
      .where(eq(careerProfilesTable.id, profileId));
  }

  listPositions(profileId: string) {
    return this.tx
      .select()
      .from(positionsTable)
      .where(eq(positionsTable.profileId, profileId));
  }

  async insertPosition(position: Insert<typeof positionsTable>) {
    const [row] = await this.tx
      .insert(positionsTable)
      .values(position)
      .returning();
    return row;
  }

  listCredentials(profileId: string) {
    return this.tx
      .select()
      .from(credentialsTable)
      .where(eq(credentialsTable.profileId, profileId));
  }

  async insertCredential(credential: Insert<typeof credentialsTable>) {
    const [row] = await this.tx
      .insert(credentialsTable)
      .values(credential)
      .returning();
    return row;
  }

  listDocuments(profileId: string) {
    return this.tx
      .select()
      .from(sourceDocumentsTable)
      .where(eq(sourceDocumentsTable.profileId, profileId))
      .orderBy(desc(sourceDocumentsTable.createdAt));
  }

  /**
   * Locks the profile for the rest of the transaction, so concurrent
   * uploads count the sources one at a time.
   */
  async lockProfile(profileId: string) {
    await this.tx
      .select({ id: careerProfilesTable.id })
      .from(careerProfilesTable)
      .where(eq(careerProfilesTable.id, profileId))
      .for("update");
  }

  /** Every stored source takes a slot of the limit. */
  async countDocuments(profileId: string) {
    return this.tx.$count(
      sourceDocumentsTable,
      eq(sourceDocumentsTable.profileId, profileId)
    );
  }

  /** Deletes a source and drops it from the positions and credentials it fed. */
  async deleteDocument(sourceDocumentId: string) {
    for (const table of [positionsTable, credentialsTable]) {
      await this.tx
        .update(table)
        .set({
          sourceDocumentIds: sql`array_remove(${table.sourceDocumentIds}, ${sourceDocumentId}::uuid)`,
        })
        .where(arrayContains(table.sourceDocumentIds, [sourceDocumentId]));
    }
    await this.tx
      .delete(sourceDocumentsTable)
      .where(eq(sourceDocumentsTable.id, sourceDocumentId));
  }

  /** Locks the source's row for the rest of the transaction. */
  async findDocumentForUpdate(sourceDocumentId: string) {
    const [row] = await this.tx
      .select()
      .from(sourceDocumentsTable)
      .where(eq(sourceDocumentsTable.id, sourceDocumentId))
      .for("update");
    return row;
  }

  async findDocument(sourceDocumentId: string) {
    const [row] = await this.tx
      .select()
      .from(sourceDocumentsTable)
      .where(eq(sourceDocumentsTable.id, sourceDocumentId));
    return row;
  }

  /** Finished imports whose summary the agent hasn't said yet, oldest first. */
  listUnsaidImportSummaries(profileId: string) {
    return this.tx
      .select({
        sourceDocumentId: sourceDocumentsTable.id,
        encryptedImportSummary: sourceDocumentsTable.encryptedImportSummary,
      })
      .from(sourceDocumentsTable)
      .where(
        and(
          eq(sourceDocumentsTable.profileId, profileId),
          eq(sourceDocumentsTable.importStatus, "imported"),
          isNotNull(sourceDocumentsTable.encryptedImportSummary),
          isNull(sourceDocumentsTable.importSummarySaidAt)
        )
      )
      .orderBy(sourceDocumentsTable.createdAt);
  }

  /** Marks import summaries said, once the chat has said them. */
  async markImportSummariesSaid(sourceDocumentIds: string[]) {
    if (sourceDocumentIds.length === 0) return;
    await this.tx
      .update(sourceDocumentsTable)
      .set({ importSummarySaidAt: new Date() })
      .where(inArray(sourceDocumentsTable.id, sourceDocumentIds));
  }

  async updateDocument(
    sourceDocumentId: string,
    changes: Partial<Insert<typeof sourceDocumentsTable>>
  ) {
    await this.tx
      .update(sourceDocumentsTable)
      .set(changes)
      .where(eq(sourceDocumentsTable.id, sourceDocumentId));
  }

  async insertDocument(document: Insert<typeof sourceDocumentsTable>) {
    const [row] = await this.tx
      .insert(sourceDocumentsTable)
      .values(document)
      .returning();
    return row;
  }
}
