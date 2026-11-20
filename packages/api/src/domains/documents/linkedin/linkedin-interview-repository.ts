import { and, asc, eq } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import {
  linkedinInstructionsTable,
  linkedinInterviewsTable,
  linkedinTurnsTable,
} from "../db/linkedin-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class LinkedinInterviewRepository {
  constructor(private readonly tx: DbClient) {}

  async findInterview(interviewId: string) {
    const [row] = await this.tx
      .select()
      .from(linkedinInterviewsTable)
      .where(eq(linkedinInterviewsTable.id, interviewId));
    return row ?? null;
  }

  async findInterviewBySection(documentId: string, section: string) {
    const [row] = await this.tx
      .select()
      .from(linkedinInterviewsTable)
      .where(
        and(
          eq(linkedinInterviewsTable.documentId, documentId),
          eq(linkedinInterviewsTable.section, section)
        )
      );
    return row ?? null;
  }

  /** Locked until the transaction ends: one answer at a time. */
  async lockInterview(interviewId: string) {
    const [row] = await this.tx
      .select()
      .from(linkedinInterviewsTable)
      .where(eq(linkedinInterviewsTable.id, interviewId))
      .for("update");
    return row ?? null;
  }

  /**
   * One interview per step; asking again begins a new one. The
   * instructions it left stay.
   */
  async replaceInterview(row: Insert<typeof linkedinInterviewsTable>) {
    await this.tx
      .delete(linkedinInterviewsTable)
      .where(
        and(
          eq(linkedinInterviewsTable.documentId, row.documentId),
          eq(linkedinInterviewsTable.section, row.section)
        )
      );
    const [inserted] = await this.tx
      .insert(linkedinInterviewsTable)
      .values(row)
      .returning();
    return inserted;
  }

  async updateInterview(
    interviewId: string,
    changes: Partial<Insert<typeof linkedinInterviewsTable>>
  ) {
    await this.tx
      .update(linkedinInterviewsTable)
      .set(changes)
      .where(eq(linkedinInterviewsTable.id, interviewId));
  }

  listTurns(interviewId: string) {
    return this.tx
      .select()
      .from(linkedinTurnsTable)
      .where(eq(linkedinTurnsTable.interviewId, interviewId))
      .orderBy(asc(linkedinTurnsTable.sequence));
  }

  async insertTurn(row: Omit<Insert<typeof linkedinTurnsTable>, "sequence">) {
    const turns = await this.listTurns(row.interviewId);
    await this.tx
      .insert(linkedinTurnsTable)
      .values({ ...row, sequence: turns.length + 1 });
  }

  /** The document's instructions the writer reads: the kept ones. */
  listKeptInstructions(documentId: string) {
    return this.tx
      .select()
      .from(linkedinInstructionsTable)
      .where(
        and(
          eq(linkedinInstructionsTable.documentId, documentId),
          eq(linkedinInstructionsTable.status, "kept")
        )
      )
      .orderBy(asc(linkedinInstructionsTable.createdAt));
  }

  async insertInstructions(
    rows: Array<Insert<typeof linkedinInstructionsTable>>
  ) {
    if (rows.length === 0) return;
    await this.tx.insert(linkedinInstructionsTable).values(rows);
  }

  async findInstruction(linkedinInstructionId: string) {
    const [row] = await this.tx
      .select()
      .from(linkedinInstructionsTable)
      .where(eq(linkedinInstructionsTable.id, linkedinInstructionId));
    return row ?? null;
  }

  async updateInstruction(
    linkedinInstructionId: string,
    changes: Partial<Insert<typeof linkedinInstructionsTable>>
  ) {
    await this.tx
      .update(linkedinInstructionsTable)
      .set(changes)
      .where(eq(linkedinInstructionsTable.id, linkedinInstructionId));
  }
}
