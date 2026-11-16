import { and, eq, inArray } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import {
  careerGoalsTable,
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

  async findStory(input: { profileId: string; storyId: string }) {
    const [row] = await this.tx
      .select()
      .from(storiesTable)
      .where(
        and(
          eq(storiesTable.id, input.storyId),
          eq(storiesTable.profileId, input.profileId)
        )
      );
    return row ?? null;
  }

  async updateStoryEvidence(input: { storyId: string; evidenceIds: string[] }) {
    await this.tx
      .update(storiesTable)
      .set({ evidenceIds: input.evidenceIds })
      .where(eq(storiesTable.id, input.storyId));
  }

  listCareerGoals(profileId: string) {
    return this.tx
      .select()
      .from(careerGoalsTable)
      .where(eq(careerGoalsTable.profileId, profileId))
      .orderBy(careerGoalsTable.createdAt);
  }

  async insertCareerGoals(rows: Array<Insert<typeof careerGoalsTable>>) {
    if (rows.length === 0) return;
    await this.tx.insert(careerGoalsTable).values(rows);
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

  async moveCredentialContent(input: {
    fromCredentialId: string;
    toCredentialId: string;
  }) {
    await this.tx
      .update(evidenceTable)
      .set({ credentialId: input.toCredentialId })
      .where(eq(evidenceTable.credentialId, input.fromCredentialId));
    await this.tx
      .update(storiesTable)
      .set({ credentialId: input.toCredentialId })
      .where(eq(storiesTable.credentialId, input.fromCredentialId));
  }

  countEvidenceByIds(evidenceIds: string[]) {
    if (evidenceIds.length === 0) return Promise.resolve([]);
    return this.tx
      .select({ id: evidenceTable.id })
      .from(evidenceTable)
      .where(inArray(evidenceTable.id, evidenceIds));
  }
}
