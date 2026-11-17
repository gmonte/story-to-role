import { and, desc, eq, max } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import {
  profileDocumentsTable,
  profileVersionsTable,
} from "./db/profile-tables";
import type { ProfileDocumentKind } from "./schemas/profile";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class ProfileRepository {
  constructor(private readonly tx: DbClient) {}

  async findDocument(userId: string, kind: ProfileDocumentKind) {
    const [row] = await this.tx
      .select()
      .from(profileDocumentsTable)
      .where(
        and(
          eq(profileDocumentsTable.userId, userId),
          eq(profileDocumentsTable.kind, kind)
        )
      );
    return row;
  }

  /** Locks the document's row for the rest of the transaction. */
  async findDocumentForUpdate(userId: string, kind: ProfileDocumentKind) {
    const [row] = await this.tx
      .select()
      .from(profileDocumentsTable)
      .where(
        and(
          eq(profileDocumentsTable.userId, userId),
          eq(profileDocumentsTable.kind, kind)
        )
      )
      .for("update");
    return row;
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
}
