import { eq, inArray } from "drizzle-orm";

import {
  careerProfilesTable,
  sourceDocumentsTable,
} from "@repo/api/domains/career/db/career-tables";
import { renderedFilesTable } from "@repo/api/domains/documents/db/documents-tables";
import { usersTable } from "@repo/api/domains/users/db/users-tables";
import type { DbClient } from "@repo/api/tools/db-client";

export class AccountRepository {
  constructor(private readonly tx: DbClient) {}

  /** Every stored file of the user: imported documents and rendered PDFs. */
  async storageKeys(userId: string) {
    const profiles = await this.tx
      .select({ id: careerProfilesTable.id })
      .from(careerProfilesTable)
      .where(eq(careerProfilesTable.userId, userId));
    const profileIds = profiles.map((row) => row.id);
    if (profileIds.length === 0) return [];
    const imported = await this.tx
      .select({ storageKey: sourceDocumentsTable.storageKey })
      .from(sourceDocumentsTable)
      .where(inArray(sourceDocumentsTable.profileId, profileIds));
    const rendered = await this.tx
      .select({ storageKey: renderedFilesTable.storageKey })
      .from(renderedFilesTable)
      .where(inArray(renderedFilesTable.profileId, profileIds));
    return [...imported, ...rendered].map((row) => row.storageKey);
  }

  findUserByClerkId(clerkUserId: string) {
    return this.tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .then((rows) => rows[0] ?? null);
  }

  /**
   * Deletes the user and, by cascade, everything they own, their data key
   * included: what a backup still holds can no longer be decrypted.
   */
  async deleteUser(userId: string) {
    await this.tx.delete(usersTable).where(eq(usersTable.id, userId));
  }
}
