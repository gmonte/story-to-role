import { and, asc, count, desc, eq, inArray } from "drizzle-orm";

import { applicationsTable } from "@repo/api/domains/applications/db/applications-tables";
import { tasksTable } from "@repo/api/domains/tasks/db/tasks-tables";
import type { DbClient } from "@repo/api/tools/db-client";

import {
  documentSnapshotsTable,
  documentsTable,
  documentVersionsTable,
  generationsTable,
  reviewRoundsTable,
} from "./db/documents-tables";
import { resumeTemplatesTable, styleProfilesTable } from "./db/writing-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class DocumentsRepository {
  constructor(private readonly tx: DbClient) {}

  async findApplicationByOpening(openingId: string) {
    const [row] = await this.tx
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.openingId, openingId));
    return row ?? null;
  }

  async findApplication(applicationId: string) {
    const [row] = await this.tx
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.id, applicationId));
    return row ?? null;
  }

  /**
   * The opening's application, created if missing; two requests at once
   * share one row instead of colliding on the unique opening.
   */
  async findOrInsertApplication(application: Insert<typeof applicationsTable>) {
    await this.tx
      .insert(applicationsTable)
      .values(application)
      .onConflictDoNothing({ target: applicationsTable.openingId });
    return await this.findApplicationByOpening(application.openingId);
  }

  async updateApplication(
    applicationId: string,
    changes: Partial<Insert<typeof applicationsTable>>
  ) {
    await this.tx
      .update(applicationsTable)
      .set(changes)
      .where(eq(applicationsTable.id, applicationId));
  }

  listApplications(profileId: string) {
    return this.tx
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.profileId, profileId));
  }

  async findDocument(documentId: string) {
    const [row] = await this.tx
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, documentId));
    return row ?? null;
  }

  /** The application's document of a kind, created if missing. */
  async findOrInsertApplicationDocument(input: {
    profileId: string;
    applicationId: string;
    kind: "resume" | "cover_letter";
  }) {
    await this.tx
      .insert(documentsTable)
      .values(input)
      .onConflictDoNothing({
        target: [documentsTable.applicationId, documentsTable.kind],
      });
    const [row] = await this.tx
      .select()
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.applicationId, input.applicationId),
          eq(documentsTable.kind, input.kind)
        )
      );
    return row;
  }

  listApplicationDocuments(applicationId: string) {
    return this.tx
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.applicationId, applicationId));
  }

  async insertDocument(document: Insert<typeof documentsTable>) {
    const [row] = await this.tx
      .insert(documentsTable)
      .values(document)
      .returning();
    return row;
  }

  listVersions(documentIds: string[]) {
    if (documentIds.length === 0) return Promise.resolve([]);
    return this.tx
      .select()
      .from(documentVersionsTable)
      .where(inArray(documentVersionsTable.documentId, documentIds))
      .orderBy(asc(documentVersionsTable.createdAt));
  }

  async findVersion(versionId: string) {
    const [row] = await this.tx
      .select()
      .from(documentVersionsTable)
      .where(eq(documentVersionsTable.id, versionId));
    return row ?? null;
  }

  async insertVersion(version: Insert<typeof documentVersionsTable>) {
    const [row] = await this.tx
      .insert(documentVersionsTable)
      .values(version)
      .returning();
    return row;
  }

  async updateVersion(
    versionId: string,
    changes: Partial<Insert<typeof documentVersionsTable>>
  ) {
    await this.tx
      .update(documentVersionsTable)
      .set(changes)
      .where(eq(documentVersionsTable.id, versionId));
  }

  /**
   * Locks the version until the transaction ends, so snapshots pushed or
   * popped at the same time line up instead of colliding on a sequence.
   */
  async lockVersion(versionId: string) {
    const [row] = await this.tx
      .select({ id: documentVersionsTable.id })
      .from(documentVersionsTable)
      .where(eq(documentVersionsTable.id, versionId))
      .for("update");
    return row ?? null;
  }

  async deleteVersion(versionId: string) {
    await this.tx
      .delete(documentVersionsTable)
      .where(eq(documentVersionsTable.id, versionId));
  }

  /** Newest first: the first one is the official snapshot. */
  listSnapshots(versionId: string) {
    return this.tx
      .select()
      .from(documentSnapshotsTable)
      .where(eq(documentSnapshotsTable.versionId, versionId))
      .orderBy(desc(documentSnapshotsTable.sequence));
  }

  /** The official snapshot and the one below it, if any. */
  async topTwoSnapshots(versionId: string) {
    const [latest, previous] = await this.listSnapshots(versionId).limit(2);
    return { latest: latest ?? null, previous: previous ?? null };
  }

  async countSnapshots(versionId: string) {
    const [row] = await this.tx
      .select({ count: count() })
      .from(documentSnapshotsTable)
      .where(eq(documentSnapshotsTable.versionId, versionId));
    return row?.count ?? 0;
  }

  async latestSnapshot(versionId: string) {
    const [row] = await this.listSnapshots(versionId).limit(1);
    return row ?? null;
  }

  async findSnapshot(snapshotId: string) {
    const [row] = await this.tx
      .select()
      .from(documentSnapshotsTable)
      .where(eq(documentSnapshotsTable.id, snapshotId));
    return row ?? null;
  }

  async insertSnapshot(snapshot: Insert<typeof documentSnapshotsTable>) {
    const [row] = await this.tx
      .insert(documentSnapshotsTable)
      .values(snapshot)
      .returning();
    return row;
  }

  async deleteSnapshot(snapshotId: string) {
    await this.tx
      .delete(documentSnapshotsTable)
      .where(eq(documentSnapshotsTable.id, snapshotId));
  }

  async findGeneration(generationId: string) {
    const [row] = await this.tx
      .select()
      .from(generationsTable)
      .where(eq(generationsTable.id, generationId));
    return row ?? null;
  }

  async insertGeneration(generation: Insert<typeof generationsTable>) {
    const [row] = await this.tx
      .insert(generationsTable)
      .values(generation)
      .returning();
    return row;
  }

  async updateGeneration(
    generationId: string,
    changes: Partial<Insert<typeof generationsTable>>
  ) {
    await this.tx
      .update(generationsTable)
      .set(changes)
      .where(eq(generationsTable.id, generationId));
  }

  async latestGeneration(documentId: string) {
    const [row] = await this.tx
      .select()
      .from(generationsTable)
      .where(eq(generationsTable.documentId, documentId))
      .orderBy(desc(generationsTable.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** What the generation's task last reported, for "review round 2 of 3". */
  async generationProgress(generationId: string) {
    const [row] = await this.tx
      .select({ progress: tasksTable.progress })
      .from(tasksTable)
      .where(eq(tasksTable.subjectId, generationId))
      .orderBy(desc(tasksTable.createdAt))
      .limit(1);
    return row?.progress ?? null;
  }

  async insertReviewRounds(rows: Array<Insert<typeof reviewRoundsTable>>) {
    if (rows.length === 0) return;
    await this.tx.insert(reviewRoundsTable).values(rows);
  }

  listReviewRounds(generationId: string) {
    return this.tx
      .select()
      .from(reviewRoundsTable)
      .where(eq(reviewRoundsTable.generationId, generationId))
      .orderBy(asc(reviewRoundsTable.round));
  }

  async findTemplate(profileId: string) {
    const [row] = await this.tx
      .select()
      .from(resumeTemplatesTable)
      .where(eq(resumeTemplatesTable.profileId, profileId));
    return row ?? null;
  }

  async upsertTemplate(template: Insert<typeof resumeTemplatesTable>) {
    await this.tx
      .insert(resumeTemplatesTable)
      .values(template)
      .onConflictDoUpdate({
        target: resumeTemplatesTable.profileId,
        set: {
          sections: template.sections,
          encryptedHeader: template.encryptedHeader,
        },
      });
  }

  async findStyleProfile(profileId: string) {
    const [row] = await this.tx
      .select()
      .from(styleProfilesTable)
      .where(eq(styleProfilesTable.profileId, profileId));
    return row ?? null;
  }

  /** New samples start a new extraction: the old profile is dropped. */
  async saveStyleSamples(input: {
    profileId: string;
    encryptedSamples: string;
  }) {
    await this.tx
      .insert(styleProfilesTable)
      .values({ ...input, encryptedProfile: null, approvedAt: null })
      .onConflictDoUpdate({
        target: styleProfilesTable.profileId,
        set: {
          encryptedSamples: input.encryptedSamples,
          encryptedProfile: null,
          approvedAt: null,
        },
      });
  }

  async setStyleProfile(input: {
    profileId: string;
    encryptedProfile: string;
    approvedAt: Date | null;
  }) {
    await this.tx
      .update(styleProfilesTable)
      .set({
        encryptedProfile: input.encryptedProfile,
        approvedAt: input.approvedAt,
      })
      .where(eq(styleProfilesTable.profileId, input.profileId));
  }
}
