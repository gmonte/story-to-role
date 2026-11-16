import { TRPCError } from "@trpc/server";

import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";
import { getStorage, type Storage } from "@repo/api/tools/storage/storage";

import { CareerRepository } from "../career-repository";
import type { SourceDocumentKind } from "../schemas/career";
import {
  documentLimits,
  documentTypeOf,
  isAcceptedDocumentType,
} from "./document-limits";

/**
 * Receives an imported resume or truth file: the file is stored encrypted
 * with the user's key and its import task receives only the document id.
 */
export class DocumentsService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db),
    private readonly storage: Storage = getStorage()
  ) {}

  async upload(input: {
    userId: string;
    kind: SourceDocumentKind;
    fileName: string;
    mimeType: string;
    bytes: Buffer;
  }) {
    const mimeType = documentTypeOf(input);
    if (
      !isAcceptedDocumentType(mimeType) ||
      input.bytes.length === 0 ||
      input.bytes.length > documentLimits.maxBytes
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
      const cipher = await getUserCipher(tx, input.userId);
      const storageKey = `users/${input.userId}/documents/${crypto.randomUUID()}`;
      await this.storage.put(
        storageKey,
        Buffer.from(cipher.encrypt(input.bytes.toString("base64"))),
        { contentType: "application/octet-stream" }
      );
      return new CareerRepository(tx).insertDocument({
        profileId: profile.id,
        kind: input.kind,
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
}
