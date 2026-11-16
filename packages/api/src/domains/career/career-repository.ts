import {
  and,
  arrayContains,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";

import { evidenceTable } from "@repo/api/domains/evidence/db/evidence-tables";
import { openingsTable } from "@repo/api/domains/openings/db/openings-tables";
import type { DbClient } from "@repo/api/tools/db-client";

import type {
  InterviewLanguage,
  InterviewLanguageSource,
} from "./schemas/career";
import { slotStatuses } from "./documents/document-limits";
import {
  careerNarrativesTable,
  careerProfilesTable,
  credentialsTable,
  crossNotesTable,
  positionConflictsTable,
  positionSummariesTable,
  positionsTable,
  projectsTable,
  sourceDocumentsTable,
  timelineProposalsTable,
} from "./db/career-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class CareerRepository {
  constructor(private readonly tx: DbClient) {}

  async findProfileByUserId(userId: string) {
    const [row] = await this.tx
      .select()
      .from(careerProfilesTable)
      .where(eq(careerProfilesTable.userId, userId));
    return row;
  }

  /** Whether the profile has an opening yet. */
  async hasOpening(profileId: string) {
    const rows = await this.tx
      .select({ id: openingsTable.id })
      .from(openingsTable)
      .where(eq(openingsTable.profileId, profileId))
      .limit(1);
    return rows.length > 0;
  }

  /** Whether the profile holds anything yet: an imported file, a position or an opening. */
  async hasStarted(profileId: string) {
    const first = (
      table:
        | typeof sourceDocumentsTable
        | typeof positionsTable
        | typeof openingsTable
    ) =>
      this.tx
        .select({ id: table.id })
        .from(table)
        .where(eq(table.profileId, profileId))
        .limit(1);
    const found = await Promise.all([
      first(sourceDocumentsTable),
      first(positionsTable),
      first(openingsTable),
    ]);
    return found.some((rows) => rows.length > 0);
  }

  async findProfileById(profileId: string) {
    const [row] = await this.tx
      .select()
      .from(careerProfilesTable)
      .where(eq(careerProfilesTable.id, profileId));
    return row;
  }

  async insertCrossNote(note: Insert<typeof crossNotesTable>) {
    await this.tx.insert(crossNotesTable).values(note);
  }

  listOpenCrossNotes(toPositionId: string) {
    return this.tx
      .select()
      .from(crossNotesTable)
      .where(
        and(
          eq(crossNotesTable.toPositionId, toPositionId),
          isNull(crossNotesTable.resolvedAt)
        )
      );
  }

  async resolveCrossNotes(toPositionId: string) {
    await this.tx
      .update(crossNotesTable)
      .set({ resolvedAt: new Date() })
      .where(
        and(
          eq(crossNotesTable.toPositionId, toPositionId),
          isNull(crossNotesTable.resolvedAt)
        )
      );
  }

  async insertProfileIfMissing(profile: Insert<typeof careerProfilesTable>) {
    await this.tx
      .insert(careerProfilesTable)
      .values(profile)
      .onConflictDoNothing({ target: careerProfilesTable.userId });
  }

  /**
   * Sets the career language from the first file or chat message, only while
   * nothing has set it and the profile has no evidence, in one statement: of
   * two imported at once, one wins. Returns the language the career is in.
   */
  async adoptLanguage(
    profileId: string,
    language: InterviewLanguage,
    source: Exclude<InterviewLanguageSource, "user">
  ) {
    const [adopted] = await this.tx
      .update(careerProfilesTable)
      .set({ interviewLanguage: language, interviewLanguageSource: source })
      .where(
        and(
          eq(careerProfilesTable.id, profileId),
          isNull(careerProfilesTable.interviewLanguageSource),
          this.hasNoEvidence(profileId)
        )
      )
      .returning({ language: careerProfilesTable.interviewLanguage });
    if (adopted) return adopted.language;
    const profile = await this.findProfileById(profileId);
    return profile?.interviewLanguage ?? language;
  }

  /**
   * Sets the career language the user asked for, only while the profile has
   * no evidence: facts are kept in one language. Whether it was set.
   */
  async chooseLanguage(profileId: string, language: InterviewLanguage) {
    const rows = await this.tx
      .update(careerProfilesTable)
      .set({ interviewLanguage: language, interviewLanguageSource: "user" })
      .where(
        and(
          eq(careerProfilesTable.id, profileId),
          this.hasNoEvidence(profileId)
        )
      )
      .returning({ id: careerProfilesTable.id });
    return rows.length > 0;
  }

  private hasNoEvidence(profileId: string) {
    return sql`not exists (select 1 from ${evidenceTable} where ${evidenceTable.profileId} = ${profileId})`;
  }

  async updateProfile(
    profileId: string,
    changes: Partial<Insert<typeof careerProfilesTable>>
  ) {
    await this.tx
      .update(careerProfilesTable)
      .set(changes)
      .where(eq(careerProfilesTable.id, profileId));
  }

  listPositions(profileId: string) {
    return this.tx
      .select()
      .from(positionsTable)
      .where(eq(positionsTable.profileId, profileId));
  }

  async findPosition(input: { profileId: string; positionId: string }) {
    const [row] = await this.tx
      .select()
      .from(positionsTable)
      .where(
        and(
          eq(positionsTable.id, input.positionId),
          eq(positionsTable.profileId, input.profileId)
        )
      );
    return row;
  }

  async insertPosition(position: Insert<typeof positionsTable>) {
    const [row] = await this.tx
      .insert(positionsTable)
      .values(position)
      .returning();
    return row;
  }

  async updatePosition(
    positionId: string,
    changes: Partial<Insert<typeof positionsTable>>
  ) {
    await this.tx
      .update(positionsTable)
      .set(changes)
      .where(eq(positionsTable.id, positionId));
  }

  async deletePosition(positionId: string) {
    await this.tx
      .delete(positionsTable)
      .where(eq(positionsTable.id, positionId));
  }

  listOpenConflicts(positionIds: string[]) {
    if (positionIds.length === 0) return Promise.resolve([]);
    return this.tx
      .select()
      .from(positionConflictsTable)
      .where(
        and(
          inArray(positionConflictsTable.positionId, positionIds),
          isNull(positionConflictsTable.resolvedAt)
        )
      );
  }

  async insertConflicts(
    conflicts: Array<Insert<typeof positionConflictsTable>>
  ) {
    if (conflicts.length === 0) return;
    await this.tx.insert(positionConflictsTable).values(conflicts);
  }

  async updateConflictOptions(input: {
    positionConflictId: string;
    encryptedOptions: string;
  }) {
    await this.tx
      .update(positionConflictsTable)
      .set({ encryptedOptions: input.encryptedOptions })
      .where(eq(positionConflictsTable.id, input.positionConflictId));
  }

  async findConflict(positionConflictId: string) {
    const [row] = await this.tx
      .select()
      .from(positionConflictsTable)
      .where(eq(positionConflictsTable.id, positionConflictId));
    return row;
  }

  async resolveConflict(positionConflictId: string) {
    await this.tx
      .update(positionConflictsTable)
      .set({ resolvedAt: new Date() })
      .where(eq(positionConflictsTable.id, positionConflictId));
  }

  async moveConflicts(input: { fromPositionId: string; toPositionId: string }) {
    await this.tx
      .update(positionConflictsTable)
      .set({ positionId: input.toPositionId })
      .where(eq(positionConflictsTable.positionId, input.fromPositionId));
  }

  async latestSummaries(positionIds: string[]) {
    if (positionIds.length === 0) return [];
    const rows = await this.tx
      .select()
      .from(positionSummariesTable)
      .where(inArray(positionSummariesTable.positionId, positionIds))
      .orderBy(desc(positionSummariesTable.version));
    // Keep the newest version of each position's summary.
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latest.has(row.positionId)) latest.set(row.positionId, row);
    }
    return [...latest.values()];
  }

  async insertSummary(summary: Insert<typeof positionSummariesTable>) {
    await this.tx.insert(positionSummariesTable).values(summary);
  }

  /** Projects of the profile's positions. */
  listProjects(profileId: string) {
    return this.tx
      .select({
        id: projectsTable.id,
        positionId: projectsTable.positionId,
        encryptedName: projectsTable.encryptedName,
      })
      .from(projectsTable)
      .innerJoin(
        positionsTable,
        eq(projectsTable.positionId, positionsTable.id)
      )
      .where(eq(positionsTable.profileId, profileId));
  }

  listCredentials(profileId: string) {
    return this.tx
      .select()
      .from(credentialsTable)
      .where(eq(credentialsTable.profileId, profileId));
  }

  async findCredential(input: { profileId: string; credentialId: string }) {
    const [row] = await this.tx
      .select()
      .from(credentialsTable)
      .where(
        and(
          eq(credentialsTable.id, input.credentialId),
          eq(credentialsTable.profileId, input.profileId)
        )
      );
    return row;
  }

  async insertCredential(credential: Insert<typeof credentialsTable>) {
    const [row] = await this.tx
      .insert(credentialsTable)
      .values(credential)
      .returning();
    return row;
  }

  async updateCredential(
    credentialId: string,
    changes: Partial<Insert<typeof credentialsTable>>
  ) {
    await this.tx
      .update(credentialsTable)
      .set(changes)
      .where(eq(credentialsTable.id, credentialId));
  }

  async deleteCredential(credentialId: string) {
    await this.tx
      .delete(credentialsTable)
      .where(eq(credentialsTable.id, credentialId));
  }

  listDocuments(profileId: string) {
    return this.tx
      .select()
      .from(sourceDocumentsTable)
      .where(eq(sourceDocumentsTable.profileId, profileId))
      .orderBy(desc(sourceDocumentsTable.createdAt));
  }

  /**
   * Locks the profile for the rest of the transaction, so concurrent
   * uploads count the sources one at a time.
   */
  async lockProfile(profileId: string) {
    await this.tx
      .select({ id: careerProfilesTable.id })
      .from(careerProfilesTable)
      .where(eq(careerProfilesTable.id, profileId))
      .for("update");
  }

  /** Sources that take a slot of the limit. */
  async countSlottedDocuments(profileId: string) {
    return this.tx.$count(
      sourceDocumentsTable,
      and(
        eq(sourceDocumentsTable.profileId, profileId),
        inArray(sourceDocumentsTable.status, [...slotStatuses])
      )
    );
  }

  /** Deletes a source and drops it from the positions and credentials it fed. */
  async deleteDocument(sourceDocumentId: string) {
    for (const table of [positionsTable, credentialsTable]) {
      await this.tx
        .update(table)
        .set({
          sourceDocumentIds: sql`array_remove(${table.sourceDocumentIds}, ${sourceDocumentId}::uuid)`,
        })
        .where(arrayContains(table.sourceDocumentIds, [sourceDocumentId]));
    }
    await this.tx
      .delete(sourceDocumentsTable)
      .where(eq(sourceDocumentsTable.id, sourceDocumentId));
  }

  async findDocument(sourceDocumentId: string) {
    const [row] = await this.tx
      .select()
      .from(sourceDocumentsTable)
      .where(eq(sourceDocumentsTable.id, sourceDocumentId));
    return row;
  }

  async insertDocument(document: Insert<typeof sourceDocumentsTable>) {
    const [row] = await this.tx
      .insert(sourceDocumentsTable)
      .values(document)
      .returning();
    return row;
  }

  /** The import reactions the career chat hasn't said yet. */
  async listImportReactions(profileId: string) {
    return this.tx
      .select({
        sourceDocumentId: sourceDocumentsTable.id,
        encryptedReaction: sourceDocumentsTable.encryptedReaction,
        createdAt: sourceDocumentsTable.createdAt,
      })
      .from(sourceDocumentsTable)
      .where(
        and(
          eq(sourceDocumentsTable.profileId, profileId),
          isNotNull(sourceDocumentsTable.encryptedReaction),
          isNull(sourceDocumentsTable.reactionDeliveredAt)
        )
      )
      .orderBy(sourceDocumentsTable.createdAt);
  }

  /** Marks import reactions said, once the chat has said them. */
  async markImportReactionsSaid(sourceDocumentIds: string[]) {
    if (sourceDocumentIds.length === 0) return;
    await this.tx
      .update(sourceDocumentsTable)
      .set({ reactionDeliveredAt: new Date() })
      .where(inArray(sourceDocumentsTable.id, sourceDocumentIds));
  }

  async updateDocument(
    sourceDocumentId: string,
    changes: Partial<Insert<typeof sourceDocumentsTable>>
  ) {
    await this.tx
      .update(sourceDocumentsTable)
      .set(changes)
      .where(eq(sourceDocumentsTable.id, sourceDocumentId));
  }

  listPendingProposals(profileId: string) {
    return this.tx
      .select()
      .from(timelineProposalsTable)
      .where(
        and(
          eq(timelineProposalsTable.profileId, profileId),
          isNull(timelineProposalsTable.acceptedAt),
          isNull(timelineProposalsTable.rejectedAt)
        )
      );
  }

  async findProposal(input: { profileId: string; timelineProposalId: string }) {
    const [row] = await this.tx
      .select()
      .from(timelineProposalsTable)
      .where(
        and(
          eq(timelineProposalsTable.id, input.timelineProposalId),
          eq(timelineProposalsTable.profileId, input.profileId)
        )
      );
    return row;
  }

  async insertProposal(proposal: Insert<typeof timelineProposalsTable>) {
    const [row] = await this.tx
      .insert(timelineProposalsTable)
      .values(proposal)
      .returning();
    return row;
  }

  async decideProposal(input: {
    timelineProposalId: string;
    accepted: boolean;
  }) {
    await this.tx
      .update(timelineProposalsTable)
      .set(
        input.accepted ? { acceptedAt: new Date() } : { rejectedAt: new Date() }
      )
      .where(eq(timelineProposalsTable.id, input.timelineProposalId));
  }

  async latestNarrative(profileId: string) {
    const [row] = await this.tx
      .select()
      .from(careerNarrativesTable)
      .where(eq(careerNarrativesTable.profileId, profileId))
      .orderBy(desc(careerNarrativesTable.version))
      .limit(1);
    return row;
  }

  async insertNarrative(narrative: Insert<typeof careerNarrativesTable>) {
    const [row] = await this.tx
      .insert(careerNarrativesTable)
      .values(narrative)
      .returning();
    return row;
  }

  async approveNarrative(narrativeId: string) {
    await this.tx
      .update(careerNarrativesTable)
      .set({ approvedAt: new Date() })
      .where(eq(careerNarrativesTable.id, narrativeId));
  }
}
