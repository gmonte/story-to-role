import { asc, eq, inArray } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import {
  motivationInterviewsTable,
  motivationPointsTable,
  motivationTurnsTable,
} from "../db/motivation-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class MotivationRepository {
  constructor(private readonly tx: DbClient) {}

  async findInterview(interviewId: string) {
    const [row] = await this.tx
      .select()
      .from(motivationInterviewsTable)
      .where(eq(motivationInterviewsTable.id, interviewId));
    return row ?? null;
  }

  async findInterviewByOpening(openingId: string) {
    const [row] = await this.tx
      .select()
      .from(motivationInterviewsTable)
      .where(eq(motivationInterviewsTable.openingId, openingId));
    return row ?? null;
  }

  /** Locked until the transaction ends: one answer at a time. */
  async lockInterview(interviewId: string) {
    const [row] = await this.tx
      .select()
      .from(motivationInterviewsTable)
      .where(eq(motivationInterviewsTable.id, interviewId))
      .for("update");
    return row ?? null;
  }

  /** One interview per opening; starting again begins a new one. */
  async replaceInterview(row: Insert<typeof motivationInterviewsTable>) {
    await this.tx
      .delete(motivationInterviewsTable)
      .where(eq(motivationInterviewsTable.openingId, row.openingId));
    const [inserted] = await this.tx
      .insert(motivationInterviewsTable)
      .values(row)
      .returning();
    return inserted;
  }

  async updateInterview(
    interviewId: string,
    changes: Partial<Insert<typeof motivationInterviewsTable>>
  ) {
    await this.tx
      .update(motivationInterviewsTable)
      .set(changes)
      .where(eq(motivationInterviewsTable.id, interviewId));
  }

  listTurns(interviewId: string) {
    return this.tx
      .select()
      .from(motivationTurnsTable)
      .where(eq(motivationTurnsTable.interviewId, interviewId))
      .orderBy(asc(motivationTurnsTable.sequence));
  }

  async insertTurn(row: Omit<Insert<typeof motivationTurnsTable>, "sequence">) {
    const turns = await this.listTurns(row.interviewId);
    await this.tx
      .insert(motivationTurnsTable)
      .values({ ...row, sequence: turns.length + 1 });
  }

  listPoints(interviewId: string) {
    return this.tx
      .select()
      .from(motivationPointsTable)
      .where(eq(motivationPointsTable.interviewId, interviewId))
      .orderBy(asc(motivationPointsTable.createdAt));
  }

  async insertPoints(rows: Array<Insert<typeof motivationPointsTable>>) {
    if (rows.length === 0) return;
    await this.tx.insert(motivationPointsTable).values(rows);
  }

  async updatePoints(
    pointIds: string[],
    changes: Partial<Insert<typeof motivationPointsTable>>
  ) {
    if (pointIds.length === 0) return;
    await this.tx
      .update(motivationPointsTable)
      .set(changes)
      .where(inArray(motivationPointsTable.id, pointIds));
  }
}
