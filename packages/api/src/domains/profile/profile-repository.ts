import {
  and,
  asc,
  cosineDistance,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  max,
} from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import {
  profileDocumentsTable,
  profileExtractsTable,
  profilePassagesTable,
  profileSuggestionsTable,
  profileValidationsTable,
  profileVersionsTable,
} from "./db/profile-tables";
import type { ProfileDocumentKind } from "./schemas/profile";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class ProfileRepository {
  constructor(private readonly tx: DbClient) {}

  private documentQuery(userId: string, kind: ProfileDocumentKind) {
    return this.tx
      .select()
      .from(profileDocumentsTable)
      .where(
        and(
          eq(profileDocumentsTable.userId, userId),
          eq(profileDocumentsTable.kind, kind)
        )
      );
  }

  async findDocument(userId: string, kind: ProfileDocumentKind) {
    const [row] = await this.documentQuery(userId, kind);
    return row;
  }

  /** Locks the document's row for the rest of the transaction. */
  async findDocumentForUpdate(userId: string, kind: ProfileDocumentKind) {
    const [row] = await this.documentQuery(userId, kind).for("update");
    return row;
  }

  /** Whether the user has saved any profile document yet. */
  async hasDocument(userId: string) {
    const rows = await this.tx
      .select({ id: profileDocumentsTable.id })
      .from(profileDocumentsTable)
      .where(eq(profileDocumentsTable.userId, userId))
      .limit(1);
    return rows.length > 0;
  }

  async insertDocument(document: Insert<typeof profileDocumentsTable>) {
    const [row] = await this.tx
      .insert(profileDocumentsTable)
      .values(document)
      .onConflictDoNothing()
      .returning();
    return row;
  }

  async updateDocument(
    documentId: string,
    changes: Partial<Insert<typeof profileDocumentsTable>>
  ) {
    const [row] = await this.tx
      .update(profileDocumentsTable)
      .set(changes)
      .where(eq(profileDocumentsTable.id, documentId))
      .returning();
    return row;
  }

  listVersions(documentId: string) {
    return this.tx
      .select({
        id: profileVersionsTable.id,
        number: profileVersionsTable.number,
        publishedAt: profileVersionsTable.publishedAt,
        validatedAt: profileVersionsTable.validatedAt,
      })
      .from(profileVersionsTable)
      .where(eq(profileVersionsTable.documentId, documentId))
      .orderBy(desc(profileVersionsTable.number));
  }

  async findVersion(documentId: string, versionId: string) {
    const [row] = await this.tx
      .select()
      .from(profileVersionsTable)
      .where(
        and(
          eq(profileVersionsTable.documentId, documentId),
          eq(profileVersionsTable.id, versionId)
        )
      );
    return row;
  }

  async nextVersionNumber(documentId: string) {
    const [row] = await this.tx
      .select({ last: max(profileVersionsTable.number) })
      .from(profileVersionsTable)
      .where(eq(profileVersionsTable.documentId, documentId));
    return (row?.last ?? 0) + 1;
  }

  async insertVersion(version: Insert<typeof profileVersionsTable>) {
    const [row] = await this.tx
      .insert(profileVersionsTable)
      .values(version)
      .returning();
    return row;
  }

  async findDocumentById(documentId: string) {
    const [row] = await this.tx
      .select()
      .from(profileDocumentsTable)
      .where(eq(profileDocumentsTable.id, documentId));
    return row;
  }

  async insertValidation(validation: Insert<typeof profileValidationsTable>) {
    const [row] = await this.tx
      .insert(profileValidationsTable)
      .values(validation)
      .returning();
    return row;
  }

  async findValidation(validationId: string) {
    const [row] = await this.tx
      .select()
      .from(profileValidationsTable)
      .where(eq(profileValidationsTable.id, validationId));
    return row;
  }

  async latestValidation(documentId: string) {
    const [row] = await this.tx
      .select()
      .from(profileValidationsTable)
      .where(eq(profileValidationsTable.documentId, documentId))
      .orderBy(desc(profileValidationsTable.createdAt))
      .limit(1);
    return row;
  }

  async updateValidation(
    validationId: string,
    changes: Partial<Insert<typeof profileValidationsTable>>
  ) {
    await this.tx
      .update(profileValidationsTable)
      .set(changes)
      .where(eq(profileValidationsTable.id, validationId));
  }

  async updateVersion(
    versionId: string,
    changes: Partial<Insert<typeof profileVersionsTable>>
  ) {
    await this.tx
      .update(profileVersionsTable)
      .set(changes)
      .where(eq(profileVersionsTable.id, versionId));
  }

  async insertExtract(extract: Insert<typeof profileExtractsTable>) {
    await this.tx.insert(profileExtractsTable).values(extract);
  }

  async findExtract(versionId: string) {
    const [row] = await this.tx
      .select()
      .from(profileExtractsTable)
      .where(eq(profileExtractsTable.versionId, versionId));
    return row;
  }

  async insertPassages(passages: Array<Insert<typeof profilePassagesTable>>) {
    if (passages.length)
      await this.tx.insert(profilePassagesTable).values(passages);
  }

  listPassages(versionId: string) {
    return this.tx
      .select()
      .from(profilePassagesTable)
      .where(eq(profilePassagesTable.versionId, versionId))
      .orderBy(asc(profilePassagesTable.ordinal));
  }

  passagesWithoutVectors(versionId: string) {
    return this.tx
      .select()
      .from(profilePassagesTable)
      .where(
        and(
          eq(profilePassagesTable.versionId, versionId),
          isNull(profilePassagesTable.embedding)
        )
      )
      .orderBy(asc(profilePassagesTable.ordinal));
  }

  async setPassageVector(passageId: string, embedding: number[]) {
    await this.tx
      .update(profilePassagesTable)
      .set({ embedding })
      .where(eq(profilePassagesTable.id, passageId));
  }

  async insertSuggestion(suggestion: Insert<typeof profileSuggestionsTable>) {
    const [row] = await this.tx
      .insert(profileSuggestionsTable)
      .values(suggestion)
      .returning();
    return row;
  }

  /** The suggestions waiting for the user, oldest first. */
  listPendingSuggestions(documentId: string) {
    return this.tx
      .select()
      .from(profileSuggestionsTable)
      .where(
        and(
          eq(profileSuggestionsTable.documentId, documentId),
          eq(profileSuggestionsTable.status, "pending")
        )
      )
      .orderBy(asc(profileSuggestionsTable.createdAt));
  }

  /** The last suggestions the user rejected, newest first. */
  listRejectedSuggestions(documentId: string, limit: number) {
    return this.tx
      .select()
      .from(profileSuggestionsTable)
      .where(
        and(
          eq(profileSuggestionsTable.documentId, documentId),
          eq(profileSuggestionsTable.status, "rejected")
        )
      )
      .orderBy(desc(profileSuggestionsTable.resolvedAt))
      .limit(limit);
  }

  /**
   * Ends pending suggestions of the document (accepted or rejected by the
   * user, or superseded by a newer one): the given ones, or all of them.
   * Returns how many changed.
   */
  async resolveSuggestions(input: {
    documentId: string;
    resolution: "accepted" | "rejected" | "superseded";
    profileSuggestionIds?: string[];
  }) {
    if (input.profileSuggestionIds?.length === 0) return 0;
    const resolved = await this.tx
      .update(profileSuggestionsTable)
      .set({ status: input.resolution, resolvedAt: new Date() })
      .where(
        and(
          eq(profileSuggestionsTable.documentId, input.documentId),
          eq(profileSuggestionsTable.status, "pending"),
          input.profileSuggestionIds
            ? inArray(profileSuggestionsTable.id, input.profileSuggestionIds)
            : undefined
        )
      )
      .returning({ id: profileSuggestionsTable.id });
    return resolved.length;
  }

  /**
   * The evidence passages of a version closest to a vector (ADR 0004):
   * what the person lacks (not done, gaps, studied) and rules never come
   * back as coverage.
   */
  nearestEvidencePassages(input: {
    versionId: string;
    embedding: number[];
    limit: number;
  }) {
    return this.tx
      .select({
        id: profilePassagesTable.id,
        encryptedText: profilePassagesTable.encryptedText,
      })
      .from(profilePassagesTable)
      .where(
        and(
          eq(profilePassagesTable.versionId, input.versionId),
          eq(profilePassagesTable.kind, "evidence"),
          isNotNull(profilePassagesTable.embedding)
        )
      )
      .orderBy(cosineDistance(profilePassagesTable.embedding, input.embedding))
      .limit(input.limit);
  }

  /** Passages by id, among the user's own published versions. */
  async findPassages(input: { userId: string; passageIds: string[] }) {
    if (input.passageIds.length === 0) return [];
    return this.tx
      .select({
        id: profilePassagesTable.id,
        versionId: profilePassagesTable.versionId,
        encryptedText: profilePassagesTable.encryptedText,
      })
      .from(profilePassagesTable)
      .innerJoin(
        profileVersionsTable,
        eq(profileVersionsTable.id, profilePassagesTable.versionId)
      )
      .innerJoin(
        profileDocumentsTable,
        eq(profileDocumentsTable.id, profileVersionsTable.documentId)
      )
      .where(
        and(
          inArray(profilePassagesTable.id, input.passageIds),
          eq(profileDocumentsTable.userId, input.userId)
        )
      );
  }
}
