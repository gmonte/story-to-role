import { TRPCError } from "@trpc/server";

import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "../documents-repository";
import { resumeLinkOf } from "../letter/letter-resume";
import { requireUserVersion } from "../require-version";
import type { DocumentChange } from "../schemas/document-change";
import { decryptDocument } from "../snapshot-content";
import { applyDocumentChange } from "./document-change";
import { readChangeContent } from "./propose-change";

/**
 * The changes a document agent proposed (ADR 0009): listed for the editor
 * to show in place, accepted into snapshots or rejected. Only accepted
 * ones reach the document, each as a snapshot of its own.
 */
export class ChangesService {
  constructor(private readonly db: DbClient) {}

  /** The changes waiting for the user in a version, oldest first. */
  async listChanges(input: {
    userId: string;
    versionId: string;
  }): Promise<DocumentChange[]> {
    const { version } = await requireUserVersion(
      this.db,
      input.userId,
      input.versionId
    );
    const cipher = await getUserCipher(this.db, input.userId);
    return (
      await new DocumentsRepository(this.db).listPendingChanges(version.id)
    ).map((row) => ({
      id: row.id,
      versionId: row.versionId,
      origin: row.origin,
      createdAt: row.createdAt,
      ...readChangeContent(cipher, row),
    }));
  }

  /**
   * Accepts changes (the given ones, or every pending one), oldest first,
   * each as a snapshot of its own authored by the AI (origin `suggested`)
   * and accepted by the user. A change whose lines were edited away is
   * skipped and keeps waiting: the editor offers to reject it. The edit
   * must start from the official snapshot, so a tab with older text never
   * writes over a newer one.
   */
  async acceptChanges(input: {
    userId: string;
    versionId: string;
    baseSnapshotId: string;
    documentChangeIds?: string[];
  }) {
    return this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const { version } = await requireUserVersion(
        tx,
        input.userId,
        input.versionId,
        { lock: true }
      );
      let latest = await repository.latestSnapshot(version.id);
      if (!latest) throw new TRPCError({ code: "NOT_FOUND" });
      if (latest.id !== input.baseSnapshotId) {
        throw new TRPCError({ code: "CONFLICT" });
      }
      const cipher = await getUserCipher(tx, input.userId);
      let content = decryptDocument(cipher, latest);
      if (content.kind === "linkedin") {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      const wanted = input.documentChangeIds
        ? new Set(input.documentChangeIds)
        : null;
      const accepted: string[] = [];
      const skipped: string[] = [];
      for (const row of await repository.listPendingChanges(version.id)) {
        if (wanted && !wanted.has(row.id)) continue;
        const change = readChangeContent(cipher, row);
        const next = applyDocumentChange(content, change, change.evidenceIds);
        if (!next) {
          skipped.push(row.id);
          continue;
        }
        latest = await repository.insertSnapshot({
          versionId: version.id,
          sequence: latest.sequence + 1,
          parentSnapshotId: latest.id,
          origin: "suggested",
          author: "ai",
          encryptedContent: cipher.encrypt(JSON.stringify(next)),
          ...resumeLinkOf(latest),
        });
        content = next;
        accepted.push(row.id);
      }
      await repository.resolveChanges({
        versionId: version.id,
        resolution: "accepted",
        documentChangeIds: accepted,
      });
      return { accepted, skipped, snapshotId: latest.id };
    });
  }

  /** Rejects changes: the given ones, or every pending one. */
  async rejectChanges(input: {
    userId: string;
    versionId: string;
    documentChangeIds?: string[];
  }) {
    const { version } = await requireUserVersion(
      this.db,
      input.userId,
      input.versionId
    );
    const rejected = await new DocumentsRepository(this.db).resolveChanges({
      versionId: version.id,
      resolution: "rejected",
      documentChangeIds: input.documentChangeIds,
    });
    return { rejected };
  }
}
