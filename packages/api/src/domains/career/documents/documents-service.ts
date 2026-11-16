import { TRPCError } from "@trpc/server";

import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";
import { getStorage, type Storage } from "@repo/api/tools/storage/storage";

import { CareerRepository } from "../career-repository";
import { recordCareerEvent } from "../record-career-event";
import {
  documentLimits,
  documentTypeOf,
  hasExpectedContent,
  isAcceptedDocumentType,
} from "./document-limits";
import { previewDocument, renderPdfPage } from "./document-preview";

/**
 * The user's sources: each file is stored encrypted with the user's key, its
 * import task receives only the document id, and its preview is read-only.
 */
export class DocumentsService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db),
    private readonly storage: Storage = getStorage()
  ) {}

  async upload(input: {
    userId: string;
    fileName: string;
    mimeType: string;
    bytes: Buffer;
  }) {
    const mimeType = documentTypeOf(input);
    if (
      !isAcceptedDocumentType(mimeType) ||
      input.bytes.length === 0 ||
      input.bytes.length > documentLimits.maxBytes ||
      !hasExpectedContent(input.bytes, mimeType)
    ) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }
    const profile = await new CareerRepository(this.db).findProfileByUserId(
      input.userId
    );
    if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
    // Career data arrives only after the privacy notice was shown.
    if (!profile.privacyNoticeAcceptedAt) {
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    }
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "import_document",
    });

    const document = await this.db.transaction(async (tx) => {
      const career = new CareerRepository(tx);
      // Counted under a lock: files dropped together can't overshoot.
      await career.lockProfile(profile.id);
      if (
        (await career.countSlottedDocuments(profile.id)) >=
        documentLimits.maxSources
      ) {
        throw new TRPCError({ code: "CONFLICT" });
      }
      const cipher = await getUserCipher(tx, input.userId);
      const storageKey = `users/${input.userId}/documents/${crypto.randomUUID()}`;
      await this.storage.put(
        storageKey,
        Buffer.from(cipher.encrypt(input.bytes.toString("base64"))),
        { contentType: "application/octet-stream" }
      );
      return career.insertDocument({
        profileId: profile.id,
        // Until the import reads it: confidentiality rules make it a truth file.
        kind: "resume",
        encryptedFileName: cipher.encrypt(input.fileName.slice(0, 255)),
        mimeType,
        storageKey,
      });
    });

    const { realtime } = await this.tasks.start({
      userId: input.userId,
      type: "import_document",
      subjectId: document.id,
    });
    return { sourceDocumentId: document.id, realtime };
  }

  /**
   * Removes a source and its file, freeing its slot. What was already
   * extracted from it stays: evidence and drafts only lose the link.
   */
  async remove(input: { userId: string; sourceDocumentId: string }) {
    const document = await this.requireDocument(input);
    // Its import still reads the file.
    if (document.status === "pending" || document.status === "processing") {
      throw new TRPCError({ code: "CONFLICT" });
    }
    await this.db.transaction(async (tx) => {
      await new CareerRepository(tx).deleteDocument(document.id);
      const cipher = await getUserCipher(tx, input.userId);
      await recordCareerEvent(tx, {
        userId: input.userId,
        profileId: document.profileId,
        kind: "source_removed",
        summary: `removed the source file ${cipher.decrypt(document.encryptedFileName)} (what was extracted from it stays)`,
      });
    });
    await this.storage.delete(document.storageKey);
  }

  async preview(input: { userId: string; sourceDocumentId: string }) {
    const { bytes, mimeType } = await this.readFile(input);
    return previewDocument({ bytes, mimeType });
  }

  async renderPage(input: {
    userId: string;
    sourceDocumentId: string;
    page: number;
  }) {
    const { bytes, mimeType } = await this.readFile(input);
    if (mimeType !== "application/pdf") {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }
    const png = await renderPdfPage({ bytes, page: input.page });
    if (!png) throw new TRPCError({ code: "NOT_FOUND" });
    return png;
  }

  /** A source of the user's own: anyone else's is not found. */
  private async requireDocument(input: {
    userId: string;
    sourceDocumentId: string;
  }) {
    const career = new CareerRepository(this.db);
    const [profile, document] = await Promise.all([
      career.findProfileByUserId(input.userId),
      career.findDocument(input.sourceDocumentId),
    ]);
    if (!profile || !document) throw new TRPCError({ code: "NOT_FOUND" });
    if (document.profileId !== profile.id) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return document;
  }

  private async readFile(input: { userId: string; sourceDocumentId: string }) {
    const document = await this.requireDocument(input);
    const stored = await this.storage.get(document.storageKey);
    if (!stored || !isAcceptedDocumentType(document.mimeType)) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    const cipher = await getUserCipher(this.db, input.userId);
    return {
      bytes: Buffer.from(cipher.decrypt(stored.toString("utf8")), "base64"),
      mimeType: document.mimeType,
    };
  }
}
