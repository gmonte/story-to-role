import { and, eq, inArray } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import {
  evidenceTable,
  sensitiveItemsTable,
  skillsTable,
  storiesTable,
} from "./db/evidence-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class EvidenceRepository {
  constructor(private readonly tx: DbClient) {}

  listEvidence(profileId: string) {
    return this.tx
      .select()
      .from(evidenceTable)
      .where(eq(evidenceTable.profileId, profileId));
  }

  listEvidenceForPosition(positionId: string) {
    return this.tx
      .select()
      .from(evidenceTable)
      .where(eq(evidenceTable.positionId, positionId));
  }

  async insertEvidence(rows: Array<Insert<typeof evidenceTable>>) {
    if (rows.length === 0) return [];
    return this.tx.insert(evidenceTable).values(rows).returning();
  }

  listStories(profileId: string) {
    return this.tx
      .select()
      .from(storiesTable)
      .where(eq(storiesTable.profileId, profileId));
  }

  async insertStories(rows: Array<Insert<typeof storiesTable>>) {
    if (rows.length === 0) return [];
    return this.tx.insert(storiesTable).values(rows).returning();
  }

  listSkills(profileId: string) {
    return this.tx
      .select()
      .from(skillsTable)
      .where(eq(skillsTable.profileId, profileId));
  }

  async insertSkills(rows: Array<Insert<typeof skillsTable>>) {
    if (rows.length === 0) return;
    await this.tx.insert(skillsTable).values(rows);
  }

  async updateSkillEvidence(input: { skillId: string; evidenceIds: string[] }) {
    await this.tx
      .update(skillsTable)
      .set({ evidenceIds: input.evidenceIds })
      .where(eq(skillsTable.id, input.skillId));
  }

  listSensitiveItems(profileId: string) {
    return this.tx
      .select()
      .from(sensitiveItemsTable)
      .where(eq(sensitiveItemsTable.profileId, profileId));
  }

  async findSensitiveItem(input: {
    profileId: string;
    sensitiveItemId: string;
  }) {
    const [row] = await this.tx
      .select()
      .from(sensitiveItemsTable)
      .where(
        and(
          eq(sensitiveItemsTable.id, input.sensitiveItemId),
          eq(sensitiveItemsTable.profileId, input.profileId)
        )
      );
    return row;
  }

  async insertSensitiveItems(rows: Array<Insert<typeof sensitiveItemsTable>>) {
    if (rows.length === 0) return;
    await this.tx.insert(sensitiveItemsTable).values(rows);
  }

  async updateSensitiveItem(
    sensitiveItemId: string,
    changes: Partial<Insert<typeof sensitiveItemsTable>>
  ) {
    await this.tx
      .update(sensitiveItemsTable)
      .set(changes)
      .where(eq(sensitiveItemsTable.id, sensitiveItemId));
  }

  /** Merging positions: everything owned by one moves to the other. */
  async movePositionContent(input: {
    fromPositionId: string;
    toPositionId: string;
  }) {
    await this.tx
      .update(evidenceTable)
      .set({ positionId: input.toPositionId })
      .where(eq(evidenceTable.positionId, input.fromPositionId));
    await this.tx
      .update(storiesTable)
      .set({ positionId: input.toPositionId })
      .where(eq(storiesTable.positionId, input.fromPositionId));
    await this.tx
      .update(sensitiveItemsTable)
      .set({ positionId: input.toPositionId })
      .where(eq(sensitiveItemsTable.positionId, input.fromPositionId));
  }

  countEvidenceByIds(evidenceIds: string[]) {
    if (evidenceIds.length === 0) return Promise.resolve([]);
    return this.tx
      .select({ id: evidenceTable.id })
      .from(evidenceTable)
      .where(inArray(evidenceTable.id, evidenceIds));
  }
}
