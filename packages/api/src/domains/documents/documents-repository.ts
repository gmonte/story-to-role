import {
  and,
  asc,
  cosineDistance,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { applicationsTable } from "@repo/api/domains/applications/db/applications-tables";
import { applicationSubmissionsTable } from "@repo/api/domains/applications/db/tracker-tables";
import { tasksTable } from "@repo/api/domains/tasks/db/tasks-tables";
import type { DbClient } from "@repo/api/tools/db-client";

import {
  documentSnapshotsTable,
  documentsTable,
  documentVersionsTable,
  generationsTable,
  positionTitleEquivalentsTable,
  renderedFilesTable,
  reviewRoundsTable,
} from "./db/documents-tables";
import { resumeTemplatesTable, styleProfilesTable } from "./db/writing-tables";
import type { GenerationSettings } from "./schemas/generation-settings";
import { defaultTemplateSections } from "./schemas/template";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class DocumentsRepository {
  constructor(private readonly tx: DbClient) {}

  /** The snapshots sent with applications, latest first, per version. */
  async submissionsForVersions(versionIds: string[]) {
    if (versionIds.length === 0) return [];
    return this.tx
      .select({
        versionId: applicationSubmissionsTable.versionId,
        snapshotId: applicationSubmissionsTable.snapshotId,
        sentAt: applicationSubmissionsTable.createdAt,
      })
      .from(applicationSubmissionsTable)
      .where(inArray(applicationSubmissionsTable.versionId, versionIds))
      .orderBy(desc(applicationSubmissionsTable.createdAt));
  }

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

  /**
   * A snapshot language sync recorded, or, when undo deleted it, the
   * nearest remaining ancestor below it (resume spec, "Versions and
   * snapshots"); null when none is left.
   */
  async snapshotOrAncestor(input: {
    versionId: string;
    snapshotId: string | null;
    sequence: number | null;
  }) {
    if (!input.snapshotId || input.sequence === null) return null;
    const exact = await this.findSnapshot(input.snapshotId);
    if (exact?.versionId === input.versionId) return exact;
    const [row] = await this.tx
      .select()
      .from(documentSnapshotsTable)
      .where(
        and(
          eq(documentSnapshotsTable.versionId, input.versionId),
          lt(documentSnapshotsTable.sequence, input.sequence)
        )
      )
      .orderBy(desc(documentSnapshotsTable.sequence))
      .limit(1);
    return row ?? null;
  }

  /**
   * The latest snapshot an adaptation or accepted sync wrote into either of
   * two versions from the other one, with its generation: where the pair
   * last met, which language sync uses as its base.
   */
  async latestLinkSnapshot(versionId: string, otherVersionId: string) {
    const [row] = await this.tx
      .select({
        snapshot: documentSnapshotsTable,
        generation: generationsTable,
      })
      .from(documentSnapshotsTable)
      .innerJoin(
        generationsTable,
        eq(generationsTable.id, documentSnapshotsTable.generationId)
      )
      .where(
        and(
          inArray(generationsTable.kind, ["adapt", "sync"]),
          or(
            and(
              eq(documentSnapshotsTable.versionId, versionId),
              eq(generationsTable.sourceVersionId, otherVersionId)
            ),
            and(
              eq(documentSnapshotsTable.versionId, otherVersionId),
              eq(generationsTable.sourceVersionId, versionId)
            )
          )
        )
      )
      .orderBy(desc(documentSnapshotsTable.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** A document's sync proposal awaiting the user, if any. */
  async pendingProposal(documentId: string) {
    const [row] = await this.tx
      .select()
      .from(generationsTable)
      .where(
        and(
          eq(generationsTable.documentId, documentId),
          eq(generationsTable.status, "proposed")
        )
      )
      .orderBy(desc(generationsTable.createdAt))
      .limit(1);
    return row ?? null;
  }

  async insertSnapshot(snapshot: Insert<typeof documentSnapshotsTable>) {
    const [row] = await this.tx
      .insert(documentSnapshotsTable)
      .values(snapshot)
      .returning();
    // A document now exists for its application: an external one isn't
    // external anymore (tracker spec).
    await this.tx
      .update(applicationsTable)
      .set({ external: false })
      .where(
        and(
          eq(applicationsTable.external, true),
          inArray(
            applicationsTable.id,
            this.tx
              .select({ id: documentsTable.applicationId })
              .from(documentsTable)
              .innerJoin(
                documentVersionsTable,
                eq(documentVersionsTable.documentId, documentsTable.id)
              )
              .where(eq(documentVersionsTable.id, snapshot.versionId))
          )
        )
      );
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

  /**
   * The profile version a document froze and the generation settings it
   * was written with: those of the latest generation from the profile that
   * wrote it.
   */
  async frozenGeneration(documentId: string) {
    const [row] = await this.tx
      .select({
        profileVersionId: generationsTable.profileVersionId,
        settings: generationsTable.settings,
      })
      .from(generationsTable)
      .where(
        and(
          eq(generationsTable.documentId, documentId),
          eq(generationsTable.status, "completed"),
          isNotNull(generationsTable.profileVersionId)
        )
      )
      .orderBy(desc(generationsTable.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** The latest generation from the profile that wrote this version. */
  async latestWrittenGeneration(versionId: string) {
    const [row] = await this.tx
      .select()
      .from(generationsTable)
      .where(
        and(
          eq(generationsTable.versionId, versionId),
          eq(generationsTable.kind, "generate"),
          eq(generationsTable.status, "completed")
        )
      )
      .orderBy(desc(generationsTable.createdAt))
      .limit(1);
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

  listTitleEquivalents(profileId: string) {
    return this.tx
      .select()
      .from(positionTitleEquivalentsTable)
      .where(eq(positionTitleEquivalentsTable.profileId, profileId));
  }

  /** A proposal never replaces an approved equivalent. */
  async proposeTitleEquivalent(
    row: Insert<typeof positionTitleEquivalentsTable>
  ) {
    await this.tx
      .insert(positionTitleEquivalentsTable)
      .values(row)
      .onConflictDoUpdate({
        target: [
          positionTitleEquivalentsTable.positionId,
          positionTitleEquivalentsTable.language,
        ],
        set: { encryptedTitle: row.encryptedTitle },
        setWhere: isNull(positionTitleEquivalentsTable.approvedAt),
      });
  }

  async approveTitleEquivalent(
    row: Insert<typeof positionTitleEquivalentsTable>
  ) {
    await this.tx
      .insert(positionTitleEquivalentsTable)
      .values(row)
      .onConflictDoUpdate({
        target: [
          positionTitleEquivalentsTable.positionId,
          positionTitleEquivalentsTable.language,
        ],
        set: { encryptedTitle: row.encryptedTitle, approvedAt: row.approvedAt },
      });
  }

  async findRenderedFile(snapshotId: string, template: string) {
    const [row] = await this.tx
      .select()
      .from(renderedFilesTable)
      .where(
        and(
          eq(renderedFilesTable.snapshotId, snapshotId),
          eq(renderedFilesTable.template, template)
        )
      );
    return row ?? null;
  }

  async insertRenderedFile(row: Insert<typeof renderedFilesTable>) {
    await this.tx
      .insert(renderedFilesTable)
      .values(row)
      .onConflictDoNothing({
        target: [renderedFilesTable.snapshotId, renderedFilesTable.template],
      });
  }

  /** Storage keys of the files rendered from one snapshot. */
  async renderedKeysOfSnapshot(snapshotId: string) {
    const rows = await this.tx
      .select({ storageKey: renderedFilesTable.storageKey })
      .from(renderedFilesTable)
      .where(eq(renderedFilesTable.snapshotId, snapshotId));
    return rows.map((row) => row.storageKey);
  }

  /** Storage keys of the files rendered from any of a version's snapshots. */
  async renderedKeysOfVersion(versionId: string) {
    const rows = await this.tx
      .select({ storageKey: renderedFilesTable.storageKey })
      .from(renderedFilesTable)
      .innerJoin(
        documentSnapshotsTable,
        eq(documentSnapshotsTable.id, renderedFilesTable.snapshotId)
      )
      .where(eq(documentSnapshotsTable.versionId, versionId));
    return rows.map((row) => row.storageKey);
  }

  /**
   * The profile's versions whose latest snapshot has no vector yet, with
   * that snapshot: what the similarity refresh has to embed.
   */
  async staleVersionVectors(profileId: string) {
    const latest = this.tx
      .selectDistinctOn([documentSnapshotsTable.versionId], {
        versionId: documentSnapshotsTable.versionId,
        snapshotId: sql<string>`${documentSnapshotsTable.id}`.as("snapshot_id"),
        encryptedContent: documentSnapshotsTable.encryptedContent,
      })
      .from(documentSnapshotsTable)
      .orderBy(
        documentSnapshotsTable.versionId,
        desc(documentSnapshotsTable.sequence)
      )
      .as("latest");
    return this.tx
      .select({
        versionId: documentVersionsTable.id,
        snapshotId: latest.snapshotId,
        encryptedContent: latest.encryptedContent,
      })
      .from(documentVersionsTable)
      .innerJoin(
        documentsTable,
        eq(documentsTable.id, documentVersionsTable.documentId)
      )
      .innerJoin(latest, eq(latest.versionId, documentVersionsTable.id))
      .where(
        and(
          eq(documentsTable.profileId, profileId),
          or(
            isNull(documentVersionsTable.embeddedSnapshotId),
            ne(documentVersionsTable.embeddedSnapshotId, latest.snapshotId)
          )
        )
      );
  }

  /** The profile's library documents (no application), newest first. */
  listLibraryDocuments(profileId: string) {
    return this.tx
      .select()
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.profileId, profileId),
          isNull(documentsTable.applicationId)
        )
      )
      .orderBy(desc(documentsTable.createdAt));
  }

  /**
   * Resume versions closest to a vector (an opening's): library documents
   * and other applications' documents, sent ones included.
   */
  similarVersions(input: {
    profileId: string;
    embedding: number[];
    excludeApplicationId: string | null;
    limit: number;
  }) {
    const distance = cosineDistance(
      documentVersionsTable.embedding,
      input.embedding
    );
    return this.tx
      .select({
        version: documentVersionsTable,
        document: documentsTable,
        distance,
      })
      .from(documentVersionsTable)
      .innerJoin(
        documentsTable,
        eq(documentsTable.id, documentVersionsTable.documentId)
      )
      .where(
        and(
          eq(documentsTable.profileId, input.profileId),
          eq(documentsTable.kind, "resume"),
          isNotNull(documentVersionsTable.embedding),
          input.excludeApplicationId
            ? or(
                isNull(documentsTable.applicationId),
                ne(documentsTable.applicationId, input.excludeApplicationId)
              )
            : undefined
        )
      )
      .orderBy(distance)
      .limit(input.limit);
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
        set: { sections: template.sections },
      });
  }

  /** The user's generation settings, kept with their template. */
  async saveGenerationSettings(input: {
    profileId: string;
    generationSettings: GenerationSettings;
  }) {
    await this.tx
      .insert(resumeTemplatesTable)
      .values({ ...input, sections: defaultTemplateSections })
      .onConflictDoUpdate({
        target: resumeTemplatesTable.profileId,
        set: { generationSettings: input.generationSettings },
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
