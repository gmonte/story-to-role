import { and, asc, desc, eq, inArray, isNotNull, max } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import {
  applicationInstructionsTable,
  instructionPointsTable,
  lockedFactOverridesTable,
} from "./db/instructions-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class InstructionsRepository {
  constructor(private readonly tx: DbClient) {}

  async insertInstructions(row: Insert<typeof applicationInstructionsTable>) {
    const [inserted] = await this.tx
      .insert(applicationInstructionsTable)
      .values(row)
      .returning();
    return inserted;
  }

  async findInstructions(applicationInstructionsId: string) {
    const [row] = await this.tx
      .select()
      .from(applicationInstructionsTable)
      .where(eq(applicationInstructionsTable.id, applicationInstructionsId));
    return row ?? null;
  }

  async latestInstructions(openingId: string) {
    const [row] = await this.tx
      .select()
      .from(applicationInstructionsTable)
      .where(eq(applicationInstructionsTable.openingId, openingId))
      .orderBy(desc(applicationInstructionsTable.createdAt))
      .limit(1);
    return row ?? null;
  }

  async updateInstructions(
    applicationInstructionsId: string,
    changes: Partial<Insert<typeof applicationInstructionsTable>>
  ) {
    await this.tx
      .update(applicationInstructionsTable)
      .set(changes)
      .where(eq(applicationInstructionsTable.id, applicationInstructionsId));
  }

  listPoints(openingId: string) {
    return this.tx
      .select()
      .from(instructionPointsTable)
      .where(eq(instructionPointsTable.openingId, openingId))
      .orderBy(asc(instructionPointsTable.sequence));
  }

  /** Draft points, locked until the transaction ends. */
  lockDraftPoints(openingId: string) {
    return this.tx
      .select()
      .from(instructionPointsTable)
      .where(
        and(
          eq(instructionPointsTable.openingId, openingId),
          eq(instructionPointsTable.status, "draft")
        )
      )
      .orderBy(asc(instructionPointsTable.sequence))
      .for("update");
  }

  async nextSequence(openingId: string) {
    const [row] = await this.tx
      .select({ last: max(instructionPointsTable.sequence) })
      .from(instructionPointsTable)
      .where(eq(instructionPointsTable.openingId, openingId));
    return (row?.last ?? 0) + 1;
  }

  /** Gap answers already turned into points, so a split skips them. */
  async splitFitCheckItemIds(openingId: string) {
    const rows = await this.tx
      .select({ fitCheckItemId: instructionPointsTable.fitCheckItemId })
      .from(instructionPointsTable)
      .where(
        and(
          eq(instructionPointsTable.openingId, openingId),
          isNotNull(instructionPointsTable.fitCheckItemId)
        )
      );
    return new Set(rows.map((row) => row.fitCheckItemId!));
  }

  async insertPoints(rows: Array<Insert<typeof instructionPointsTable>>) {
    if (rows.length === 0) return [];
    return this.tx.insert(instructionPointsTable).values(rows).returning();
  }

  async updatePoint(
    instructionPointId: string,
    changes: Partial<Insert<typeof instructionPointsTable>>
  ) {
    await this.tx
      .update(instructionPointsTable)
      .set(changes)
      .where(eq(instructionPointsTable.id, instructionPointId));
  }

  async deletePoints(instructionPointIds: string[]) {
    if (instructionPointIds.length === 0) return;
    await this.tx
      .delete(instructionPointsTable)
      .where(inArray(instructionPointsTable.id, instructionPointIds));
  }

  listOverrides(openingId: string) {
    return this.tx
      .select()
      .from(lockedFactOverridesTable)
      .where(eq(lockedFactOverridesTable.openingId, openingId))
      .orderBy(asc(lockedFactOverridesTable.createdAt));
  }

  /** A newer proposal for the same fact replaces the older one. */
  async upsertOverride(row: Insert<typeof lockedFactOverridesTable>) {
    await this.tx
      .insert(lockedFactOverridesTable)
      .values(row)
      .onConflictDoUpdate({
        target: [
          lockedFactOverridesTable.openingId,
          lockedFactOverridesTable.positionId,
          lockedFactOverridesTable.field,
        ],
        set: {
          encryptedValue: row.encryptedValue,
          instructionPointId: row.instructionPointId,
          confirmedAt: null,
        },
      });
  }

  async confirmOverrides(lockedFactOverrideIds: string[], confirmedAt: Date) {
    if (lockedFactOverrideIds.length === 0) return;
    await this.tx
      .update(lockedFactOverridesTable)
      .set({ confirmedAt })
      .where(inArray(lockedFactOverridesTable.id, lockedFactOverrideIds));
  }

  async deleteOverrides(lockedFactOverrideIds: string[]) {
    if (lockedFactOverrideIds.length === 0) return;
    await this.tx
      .delete(lockedFactOverridesTable)
      .where(inArray(lockedFactOverridesTable.id, lockedFactOverrideIds));
  }
}
