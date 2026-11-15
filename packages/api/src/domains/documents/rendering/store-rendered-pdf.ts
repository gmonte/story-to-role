import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";
import type { Storage } from "@repo/api/tools/storage/storage";

import { DocumentsRepository } from "../documents-repository";
import { pdfTemplate } from "./pdf-template";

/**
 * Keeps a snapshot's rendered PDF, encrypted, under its snapshot and
 * layout. When the snapshot went meanwhile (undone, or its version
 * deleted), the row can't be written and the file is removed again, so
 * nothing is left behind in storage.
 */
export async function storeRenderedPdf(input: {
  db: DbClient;
  cipher: UserCipher;
  storage: Storage;
  userId: string;
  profileId: string;
  snapshotId: string;
  bytes: Buffer;
  pages: number;
}) {
  const storageKey = `users/${input.userId}/pdfs/${input.snapshotId}-${pdfTemplate}`;
  await input.storage.put(
    storageKey,
    Buffer.from(input.cipher.encrypt(input.bytes.toString("base64"))),
    { contentType: "application/octet-stream" }
  );
  try {
    await new DocumentsRepository(input.db).insertRenderedFile({
      profileId: input.profileId,
      snapshotId: input.snapshotId,
      template: pdfTemplate,
      storageKey,
      pages: input.pages,
    });
  } catch (error) {
    await input.storage.delete(storageKey);
    if (
      await new DocumentsRepository(input.db).findSnapshot(input.snapshotId)
    ) {
      throw error;
    }
  }
}
