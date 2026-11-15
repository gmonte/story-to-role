import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import { companyFactsTable, companyResearchTable } from "../db/research-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class ResearchRepository {
  constructor(private readonly tx: DbClient) {}

  async insertResearch(row: Insert<typeof companyResearchTable>) {
    const [inserted] = await this.tx
      .insert(companyResearchTable)
      .values(row)
      .returning();
    return inserted;
  }

  async findResearch(researchId: string) {
    const [row] = await this.tx
      .select()
      .from(companyResearchTable)
      .where(eq(companyResearchTable.id, researchId));
    return row ?? null;
  }

  async latestResearch(openingId: string) {
    const [row] = await this.tx
      .select()
      .from(companyResearchTable)
      .where(eq(companyResearchTable.openingId, openingId))
      .orderBy(desc(companyResearchTable.createdAt))
      .limit(1);
    return row ?? null;
  }

  async setResearchStatus(
    researchId: string,
    status: Insert<typeof companyResearchTable>["status"]
  ) {
    await this.tx
      .update(companyResearchTable)
      .set({ status })
      .where(eq(companyResearchTable.id, researchId));
  }

  listFacts(openingId: string) {
    return this.tx
      .select()
      .from(companyFactsTable)
      .where(eq(companyFactsTable.openingId, openingId))
      .orderBy(companyFactsTable.createdAt);
  }

  async insertFacts(rows: Array<Insert<typeof companyFactsTable>>) {
    if (rows.length === 0) return;
    await this.tx.insert(companyFactsTable).values(rows);
  }

  /** A new run replaces the facts the user hasn't approved. */
  async deleteUnapprovedFacts(openingId: string) {
    await this.tx
      .delete(companyFactsTable)
      .where(
        and(
          eq(companyFactsTable.openingId, openingId),
          isNull(companyFactsTable.approvedAt)
        )
      );
  }

  async setApproval(factIds: string[], approvedAt: Date | null) {
    if (factIds.length === 0) return;
    await this.tx
      .update(companyFactsTable)
      .set({ approvedAt })
      .where(inArray(companyFactsTable.id, factIds));
  }
}
