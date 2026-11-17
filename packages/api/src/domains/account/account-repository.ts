import { eq, inArray } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import * as tables from "@repo/api/db";
import type { DbClient } from "@repo/api/tools/db-client";

type Row = Record<string, unknown>;

const idsOf = (rows: Row[]) => rows.map((row) => String(row.id));

/**
 * Tables the export leaves out on purpose: the user row is `account.json`,
 * and the data key is the secret that protects everything else.
 */
export const notExported = ["users", "user_data_keys"];

export class AccountRepository {
  constructor(private readonly tx: DbClient) {}

  private async rowsWhere(table: PgTable, column: PgColumn, ids: string[]) {
    if (ids.length === 0) return [];
    return (await this.tx
      .select()
      .from(table)
      .where(inArray(column, ids))) as Row[];
  }

  findUser(userId: string) {
    return this.tx
      .select()
      .from(tables.usersTable)
      .where(eq(tables.usersTable.id, userId))
      .then((rows) => rows[0] ?? null);
  }

  findUserByClerkId(clerkUserId: string) {
    return this.tx
      .select()
      .from(tables.usersTable)
      .where(eq(tables.usersTable.clerkUserId, clerkUserId))
      .then((rows) => rows[0] ?? null);
  }

  /**
   * Every row the user owns, by table name (privacy spec, "Export"): what
   * hangs off the user, their career profile, and the rows below those.
   */
  async ownedRows(userId: string): Promise<Record<string, Row[]>> {
    const t = tables;
    const byUser = (table: PgTable & { userId: PgColumn }) =>
      this.rowsWhere(table, table.userId, [userId]);
    const profiles = await byUser(t.careerProfilesTable);
    const profileIds = idsOf(profiles);
    const byProfile = (table: PgTable & { profileId: PgColumn }) =>
      this.rowsWhere(table, table.profileId, profileIds);

    const positions = await byProfile(t.positionsTable);
    const openings = await byProfile(t.openingsTable);
    const fitChecks = await this.rowsWhere(
      t.fitChecksTable,
      t.fitChecksTable.openingId,
      idsOf(openings)
    );
    const applications = await byProfile(t.applicationsTable);
    const motivationInterviews = await byProfile(t.motivationInterviewsTable);
    const documents = await byProfile(t.documentsTable);
    const versions = await this.rowsWhere(
      t.documentVersionsTable,
      t.documentVersionsTable.documentId,
      idsOf(documents)
    );
    const generations = await byProfile(t.generationsTable);
    const below = (table: PgTable, column: PgColumn, parents: Row[]) =>
      this.rowsWhere(table, column, idsOf(parents));

    return {
      tasks: await byUser(t.tasksTable),
      ai_usage: await byUser(t.aiUsageTable),
      ai_keys: await byUser(t.aiKeysTable),
      credit_lots: await byUser(t.creditLotsTable),
      credit_entries: await byUser(t.creditEntriesTable),
      courtesy_grants: await byUser(t.courtesyGrantsTable),
      stored_credit_confirmations: await byUser(
        t.storedCreditConfirmationsTable
      ),
      billing_customers: await byUser(t.billingCustomersTable),
      subscriptions: await byUser(t.subscriptionsTable),
      chat_messages: await byUser(t.chatMessagesTable),
      career_profiles: profiles,
      source_documents: await byProfile(t.sourceDocumentsTable),
      positions,
      credentials: await byProfile(t.credentialsTable),
      sensitive_items: await byProfile(t.sensitiveItemsTable),
      career_goals: await byProfile(t.careerGoalsTable),
      openings,
      opening_terms: await below(
        t.openingTermsTable,
        t.openingTermsTable.openingId,
        openings
      ),
      fit_checks: fitChecks,
      fit_check_items: await below(
        t.fitCheckItemsTable,
        t.fitCheckItemsTable.fitCheckId,
        fitChecks
      ),
      applications,
      application_events: await below(
        t.applicationEventsTable,
        t.applicationEventsTable.applicationId,
        applications
      ),
      application_submissions: await below(
        t.applicationSubmissionsTable,
        t.applicationSubmissionsTable.applicationId,
        applications
      ),
      tracker_settings: await byProfile(t.trackerSettingsTable),
      dismissed_reminders: await byProfile(t.dismissedRemindersTable),
      application_instructions: await byProfile(t.applicationInstructionsTable),
      instruction_points: await byProfile(t.instructionPointsTable),
      locked_fact_overrides: await byProfile(t.lockedFactOverridesTable),
      application_overrides: await byProfile(t.applicationOverridesTable),
      company_research: await byProfile(t.companyResearchTable),
      company_facts: await byProfile(t.companyFactsTable),
      motivation_interviews: motivationInterviews,
      motivation_turns: await below(
        t.motivationTurnsTable,
        t.motivationTurnsTable.interviewId,
        motivationInterviews
      ),
      motivation_points: await byProfile(t.motivationPointsTable),
      documents,
      document_versions: versions,
      document_snapshots: await below(
        t.documentSnapshotsTable,
        t.documentSnapshotsTable.versionId,
        versions
      ),
      generations,
      review_rounds: await below(
        t.reviewRoundsTable,
        t.reviewRoundsTable.generationId,
        generations
      ),
      position_title_equivalents: await byProfile(
        t.positionTitleEquivalentsTable
      ),
      rendered_files: await byProfile(t.renderedFilesTable),
      resume_templates: await byProfile(t.resumeTemplatesTable),
      style_profiles: await byProfile(t.styleProfilesTable),
    };
  }

  /** Every stored file of the user: imported documents and rendered PDFs. */
  async storageKeys(userId: string) {
    const rows = await this.ownedRows(userId);
    return [...rows.source_documents, ...rows.rendered_files].map((row) =>
      String(row.storageKey)
    );
  }

  /**
   * Deletes the user and, by cascade, everything they own, their data key
   * included: what a backup still holds can no longer be decrypted.
   */
  async deleteUser(userId: string) {
    await this.tx
      .delete(tables.usersTable)
      .where(eq(tables.usersTable.id, userId));
  }
}
