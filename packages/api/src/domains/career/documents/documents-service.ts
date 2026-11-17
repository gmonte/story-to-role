import { TRPCError } from "@trpc/server";

import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";
import { getStorage, type Storage } from "@repo/api/tools/storage/storage";

import { CareerRepository } from "../career-repository";
import {
  documentLimits,
  documentTypeOf,
  hasExpectedContent,
  isAcceptedDocumentType,
} from "./document-limits";
import { previewDocument, renderPdfPage } from "./document-preview";

/**
 * The user's sources: each file is stored encrypted with the user's key and
 * its preview is read-only. Uploading only stores the file for now; P4
 * (docs/plan.md) re-adds importing it as suggestions.
 */
export class DocumentsService {
  constructor(
    private readonly db: DbClient,
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
        kind: "resume",
        status: "stored",
        encryptedFileName: cipher.encrypt(input.fileName.slice(0, 255)),
        mimeType,
        storageKey,
      });
    });

    return { sourceDocumentId: document.id };
  }

  /** Removes a source and its file, freeing its slot. */
  async remove(input: { userId: string; sourceDocumentId: string }) {
    const document = await this.requireDocument(input);
    await new CareerRepository(this.db).deleteDocument(document.id);
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
