import { and, asc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import {
  draftFactsTable,
  draftSensitiveItemsTable,
  interviewSessionsTable,
  interviewTurnsTable,
} from "./db/interview-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class InterviewRepository {
  constructor(private readonly tx: DbClient) {}

  listSessions(profileId: string) {
    return this.tx
      .select()
      .from(interviewSessionsTable)
      .where(eq(interviewSessionsTable.profileId, profileId))
      .orderBy(asc(interviewSessionsTable.createdAt));
  }

  async findSession(input: { profileId: string; sessionId: string }) {
    const [row] = await this.tx
      .select()
      .from(interviewSessionsTable)
      .where(
        and(
          eq(interviewSessionsTable.id, input.sessionId),
          eq(interviewSessionsTable.profileId, input.profileId)
        )
      );
    return row;
  }

  /** Locks the session row until the transaction ends (approvals). */
  async findSessionForUpdate(input: { profileId: string; sessionId: string }) {
    const [row] = await this.tx
      .select()
      .from(interviewSessionsTable)
      .where(
        and(
          eq(interviewSessionsTable.id, input.sessionId),
          eq(interviewSessionsTable.profileId, input.profileId)
        )
      )
      .for("update");
    return row;
  }

  async findSessionById(sessionId: string) {
    const [row] = await this.tx
      .select()
      .from(interviewSessionsTable)
      .where(eq(interviewSessionsTable.id, sessionId));
    return row;
  }

  async insertSession(session: Insert<typeof interviewSessionsTable>) {
    const [row] = await this.tx
      .insert(interviewSessionsTable)
      .values(session)
      .returning();
    return row;
  }

  async updateSession(
    sessionId: string,
    changes: Partial<Insert<typeof interviewSessionsTable>>
  ) {
    await this.tx
      .update(interviewSessionsTable)
      .set(changes)
      .where(eq(interviewSessionsTable.id, sessionId));
  }

  async addSessionTokens(input: {
    sessionId: string;
    turnTokens: number;
    inputTokens: number;
    outputTokens: number;
  }) {
    await this.tx
      .update(interviewSessionsTable)
      .set({
        turnTokens: sql`${interviewSessionsTable.turnTokens} + ${input.turnTokens}`,
        inputTokens: sql`${interviewSessionsTable.inputTokens} + ${input.inputTokens}`,
        outputTokens: sql`${interviewSessionsTable.outputTokens} + ${input.outputTokens}`,
      })
      .where(eq(interviewSessionsTable.id, input.sessionId));
  }

  async moveSessions(input: { fromPositionId: string; toPositionId: string }) {
    await this.tx
      .update(interviewSessionsTable)
      .set({ positionId: input.toPositionId })
      .where(eq(interviewSessionsTable.positionId, input.fromPositionId));
  }

  async moveCredentialSessions(input: {
    fromCredentialId: string;
    toCredentialId: string;
  }) {
    await this.tx
      .update(interviewSessionsTable)
      .set({ credentialId: input.toCredentialId })
      .where(eq(interviewSessionsTable.credentialId, input.fromCredentialId));
  }

  /** Only ever called with an open session: closed turns never reach a prompt. */
  listTurns(sessionId: string) {
    return this.tx
      .select()
      .from(interviewTurnsTable)
      .where(eq(interviewTurnsTable.sessionId, sessionId))
      .orderBy(asc(interviewTurnsTable.createdAt), asc(interviewTurnsTable.id));
  }

  async findTurn(turnId: string) {
    const [row] = await this.tx
      .select()
      .from(interviewTurnsTable)
      .where(eq(interviewTurnsTable.id, turnId));
    return row;
  }

  async updateTurnKind(input: {
    turnId: string;
    kind: Insert<typeof interviewTurnsTable>["kind"];
  }) {
    await this.tx
      .update(interviewTurnsTable)
      .set({ kind: input.kind })
      .where(eq(interviewTurnsTable.id, input.turnId));
  }

  async insertTurn(turn: Insert<typeof interviewTurnsTable>) {
    const [row] = await this.tx
      .insert(interviewTurnsTable)
      .values(turn)
      .returning();
    return row;
  }

  listDrafts(sessionId: string) {
    return this.tx
      .select()
      .from(draftFactsTable)
      .where(eq(draftFactsTable.sessionId, sessionId))
      .orderBy(asc(draftFactsTable.createdAt));
  }

  /** How many drafts still wait for review, per open session. */
  async countPendingDrafts(sessionIds: string[]) {
    if (sessionIds.length === 0) return new Map<string, number>();
    const rows = await this.tx
      .select({
        sessionId: draftFactsTable.sessionId,
        count: sql<number>`count(*)::int`,
      })
      .from(draftFactsTable)
      .where(
        and(
          inArray(draftFactsTable.sessionId, sessionIds),
          eq(draftFactsTable.status, "draft")
        )
      )
      .groupBy(draftFactsTable.sessionId);
    return new Map(rows.map((row) => [row.sessionId, row.count]));
  }

  async insertDraft(draft: Insert<typeof draftFactsTable>) {
    const [row] = await this.tx
      .insert(draftFactsTable)
      .values(draft)
      .returning();
    return row;
  }

  async updateDrafts(
    draftIds: string[],
    changes: Partial<Insert<typeof draftFactsTable>>
  ) {
    if (draftIds.length === 0) return;
    await this.tx
      .update(draftFactsTable)
      .set(changes)
      .where(inArray(draftFactsTable.id, draftIds));
  }

  listDraftSensitiveItems(sessionId: string) {
    return this.tx
      .select()
      .from(draftSensitiveItemsTable)
      .where(eq(draftSensitiveItemsTable.sessionId, sessionId));
  }

  async insertDraftSensitiveItem(
    item: Insert<typeof draftSensitiveItemsTable>
  ) {
    await this.tx.insert(draftSensitiveItemsTable).values(item);
  }

  /** Privacy spec: transcripts go 7 days after their extraction is approved. */
  async deleteTurnsApprovedBefore(cutoff: Date) {
    const sessions = this.tx
      .select({ id: interviewSessionsTable.id })
      .from(interviewSessionsTable)
      .where(
        and(
          isNotNull(interviewSessionsTable.extractionApprovedAt),
          lt(interviewSessionsTable.extractionApprovedAt, cutoff)
        )
      );
    const deleted = await this.tx
      .delete(interviewTurnsTable)
      .where(inArray(interviewTurnsTable.sessionId, sessions))
      .returning({ id: interviewTurnsTable.id });
    return deleted.length;
  }
}
