import { eq, inArray } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { strToU8, zipSync } from "fflate";

import * as tables from "@repo/api/db";
import {
  getUserCipher,
  type UserCipher,
} from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";
import type { Storage } from "@repo/api/tools/storage/storage";

// Never exported: vectors are derived, and keys are secrets.
const leftOut = new Set(["embedding", "encryptedKey", "wrappedKey"]);

const lowerFirst = (text: string) =>
  text.charAt(0).toLowerCase() + text.slice(1);

/** A stored structure (a snapshot's content) comes back as JSON. */
function parsed(text: string): unknown {
  if (!/^[[{]/.test(text)) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * A row as the user reads it: every `encryptedX` column decrypted to `x`,
 * vectors and secrets left out.
 */
function readable(cipher: UserCipher, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (leftOut.has(key)) continue;
    if (key.startsWith("encrypted")) {
      out[lowerFirst(key.slice("encrypted".length))] =
        typeof value === "string" ? parsed(cipher.decrypt(value)) : value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * The user's whole account as a ZIP (privacy spec, "Export"): the evidence
 * base, positions, applications, snapshots and everything else as JSON,
 * the rendered PDFs and the files they imported.
 */
export async function buildAccountExport(deps: {
  db: DbClient;
  storage: Storage;
  userId: string;
}) {
  const { db, userId } = deps;
  const cipher = await getUserCipher(db, userId);
  const rowsWhere = async <T extends PgTable>(
    table: T,
    column: PgColumn,
    ids: Array<string | null>
  ) => {
    const present = ids.filter((id): id is string => !!id);
    if (present.length === 0) return [];
    return (await db
      .select()
      .from(table as PgTable)
      .where(inArray(column, present))) as Array<Record<string, unknown>>;
  };
  const idsOf = (rows: Array<Record<string, unknown>>) =>
    rows.map((row) => row.id as string);

  const [user] = await db
    .select()
    .from(tables.usersTable)
    .where(eq(tables.usersTable.id, userId));
  const byUser = <T extends PgTable & { userId: PgColumn }>(table: T) =>
    rowsWhere(table, table.userId, [userId]);
  const profiles = await byUser(tables.careerProfilesTable);
  const profileIds = idsOf(profiles);
  const byProfile = <T extends PgTable & { profileId: PgColumn }>(table: T) =>
    rowsWhere(table, table.profileId, profileIds);

  const positions = await byProfile(tables.positionsTable);
  const positionIds = idsOf(positions);
  const sessions = await byProfile(tables.interviewSessionsTable);
  const sessionIds = idsOf(sessions);
  const openings = await byProfile(tables.openingsTable);
  const openingIds = idsOf(openings);
  const fitChecks = await rowsWhere(
    tables.fitChecksTable,
    tables.fitChecksTable.openingId,
    openingIds
  );
  const applications = await byProfile(tables.applicationsTable);
  const applicationIds = idsOf(applications);
  const motivationInterviews = await byProfile(
    tables.motivationInterviewsTable
  );
  const documents = await byProfile(tables.documentsTable);
  const versions = await rowsWhere(
    tables.documentVersionsTable,
    tables.documentVersionsTable.documentId,
    idsOf(documents)
  );
  const generations = await byProfile(tables.generationsTable);
  const sourceDocuments = await byProfile(tables.sourceDocumentsTable);
  const renderedFiles = await byProfile(tables.renderedFilesTable);
  const aiKeys = await byUser(tables.aiKeysTable);

  const sections: Record<string, Array<Record<string, unknown>>> = {
    "career/profile": profiles,
    "career/positions": positions,
    "career/position-conflicts": await rowsWhere(
      tables.positionConflictsTable,
      tables.positionConflictsTable.positionId,
      positionIds
    ),
    "career/projects": await rowsWhere(
      tables.projectsTable,
      tables.projectsTable.positionId,
      positionIds
    ),
    "career/position-summaries": await rowsWhere(
      tables.positionSummariesTable,
      tables.positionSummariesTable.positionId,
      positionIds
    ),
    "career/cross-notes": await rowsWhere(
      tables.crossNotesTable,
      tables.crossNotesTable.toPositionId,
      positionIds
    ),
    "career/credentials": await byProfile(tables.credentialsTable),
    "career/narratives": await byProfile(tables.careerNarrativesTable),
    "career/timeline-proposals": await byProfile(tables.timelineProposalsTable),
    "career/goals": await byProfile(tables.careerGoalsTable),
    "career/imported-files": sourceDocuments,
    "evidence/evidence": await byProfile(tables.evidenceTable),
    "evidence/stories": await byProfile(tables.storiesTable),
    "evidence/skills": await byProfile(tables.skillsTable),
    "evidence/sensitive-items": await byProfile(tables.sensitiveItemsTable),
    "interview/sessions": sessions,
    "interview/turns": await rowsWhere(
      tables.interviewTurnsTable,
      tables.interviewTurnsTable.sessionId,
      sessionIds
    ),
    "interview/draft-facts": await rowsWhere(
      tables.draftFactsTable,
      tables.draftFactsTable.sessionId,
      sessionIds
    ),
    "interview/draft-sensitive-items": await rowsWhere(
      tables.draftSensitiveItemsTable,
      tables.draftSensitiveItemsTable.sessionId,
      sessionIds
    ),
    "openings/openings": openings,
    "openings/terms": await rowsWhere(
      tables.openingTermsTable,
      tables.openingTermsTable.openingId,
      openingIds
    ),
    "openings/fit-checks": fitChecks,
    "openings/fit-check-items": await rowsWhere(
      tables.fitCheckItemsTable,
      tables.fitCheckItemsTable.fitCheckId,
      idsOf(fitChecks)
    ),
    "applications/applications": applications,
    "applications/events": await rowsWhere(
      tables.applicationEventsTable,
      tables.applicationEventsTable.applicationId,
      applicationIds
    ),
    "applications/submissions": await rowsWhere(
      tables.applicationSubmissionsTable,
      tables.applicationSubmissionsTable.applicationId,
      applicationIds
    ),
    "applications/instructions": await byProfile(
      tables.applicationInstructionsTable
    ),
    "applications/instruction-points": await byProfile(
      tables.instructionPointsTable
    ),
    "applications/locked-fact-overrides": await byProfile(
      tables.lockedFactOverridesTable
    ),
    "applications/company-research": await byProfile(
      tables.companyResearchTable
    ),
    "applications/company-facts": await byProfile(tables.companyFactsTable),
    "applications/motivation-interviews": motivationInterviews,
    "applications/motivation-turns": await rowsWhere(
      tables.motivationTurnsTable,
      tables.motivationTurnsTable.interviewId,
      idsOf(motivationInterviews)
    ),
    "applications/motivation-points": await byProfile(
      tables.motivationPointsTable
    ),
    "applications/tracker-settings": await byProfile(
      tables.trackerSettingsTable
    ),
    "documents/documents": documents,
    "documents/versions": versions,
    "documents/snapshots": await rowsWhere(
      tables.documentSnapshotsTable,
      tables.documentSnapshotsTable.versionId,
      idsOf(versions)
    ),
    "documents/generations": generations,
    "documents/review-rounds": await rowsWhere(
      tables.reviewRoundsTable,
      tables.reviewRoundsTable.generationId,
      idsOf(generations)
    ),
    "documents/title-equivalents": await byProfile(
      tables.positionTitleEquivalentsTable
    ),
    "documents/resume-template": await byProfile(tables.resumeTemplatesTable),
    "documents/style-profile": await byProfile(tables.styleProfilesTable),
    "chat/messages": await byUser(tables.chatMessagesTable),
    "billing/credit-lots": await byUser(tables.creditLotsTable),
    "billing/credit-entries": await byUser(tables.creditEntriesTable),
    "billing/courtesy-grants": await byUser(tables.courtesyGrantsTable),
    "billing/subscriptions": await byUser(tables.subscriptionsTable),
    "billing/ai-usage": await byUser(tables.aiUsageTable),
    // The key itself never leaves: only which one it is.
    "billing/own-api-key": aiKeys,
  };

  const files: Record<string, Uint8Array> = {
    "account.json": strToU8(
      JSON.stringify(
        {
          exportedAt: new Date(),
          email: user?.email,
          firstName: user?.firstName,
          lastName: user?.lastName,
          createdAt: user?.createdAt,
        },
        null,
        2
      )
    ),
  };
  for (const [name, rows] of Object.entries(sections)) {
    files[`${name}.json`] = strToU8(
      JSON.stringify(
        rows.map((row) => readable(cipher, row)),
        null,
        2
      )
    );
  }

  // Stored files are encrypted like everything else: decrypted for the ZIP.
  const readFile = async (storageKey: string) => {
    const stored = await deps.storage.get(storageKey);
    return stored
      ? new Uint8Array(
          Buffer.from(cipher.decrypt(stored.toString("utf8")), "base64")
        )
      : null;
  };
  for (const file of renderedFiles) {
    const bytes = await readFile(file.storageKey as string);
    if (bytes) files[`pdfs/${file.snapshotId as string}.pdf`] = bytes;
  }
  for (const document of sourceDocuments) {
    const bytes = await readFile(document.storageKey as string);
    const name = document.encryptedFileName
      ? cipher.decrypt(document.encryptedFileName as string)
      : (document.id as string);
    // A file name never makes a path inside the ZIP.
    const safe = name.replace(/[/\\]/g, "_");
    if (bytes) files[`imported-files/${document.id as string}-${safe}`] = bytes;
  }

  return {
    bytes: Buffer.from(zipSync(files)),
    fileName: `StoryToRole_export_${new Date().toISOString().slice(0, 10)}.zip`,
  };
}
