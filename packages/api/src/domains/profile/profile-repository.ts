import { and, asc, desc, eq, isNull, max } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import {
  profileDocumentsTable,
  profileExtractsTable,
  profilePassagesTable,
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
}
