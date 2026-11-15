import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";
import type { Storage } from "@repo/api/tools/storage/storage";

import { decryptSnapshot } from "../adaptation/adaptation-service";
import { DocumentsRepository } from "../documents-repository";
import { pdfTemplate } from "./pdf-template";
import { renderResumePdf } from "./resume-pdf";
import { storeRenderedPdf } from "./store-rendered-pdf";

/**
 * Renders a snapshot's PDF in the specified layout and keeps it, encrypted,
 * keyed by snapshot and layout (resume spec, "Download"). A snapshot never
 * changes, so a file rendered once is reused until its snapshot goes.
 */
export async function runRenderPdf(deps: {
  db: DbClient;
  cipher: UserCipher;
  storage: Storage;
  userId: string;
  snapshotId: string;
}) {
  const { db, cipher } = deps;
  const documents = new DocumentsRepository(db);
  const snapshot = await documents.findSnapshot(deps.snapshotId);
  // Undone before its turn came: nothing left to render.
  if (!snapshot) return;
  const version = await documents.findVersion(snapshot.versionId);
  const document =
    version && (await documents.findDocument(version.documentId));
  const profile =
    document &&
    (await new CareerRepository(db).findProfileById(document.profileId));
  if (!version || profile?.userId !== deps.userId) {
    throw new Error(`Snapshot ${snapshot.id} belongs to another user`);
  }
  // One layout in the MVP: the cover letter's comes with the letters.
  if (document.kind !== "resume") {
    throw new Error(`No PDF layout for ${document.kind} yet`);
  }
  if (await documents.findRenderedFile(snapshot.id, pdfTemplate)) return;

  const { bytes, pages } = await renderResumePdf({
    content: decryptSnapshot(cipher, snapshot),
    language: version.language,
  });
  await storeRenderedPdf({
    db,
    cipher,
    storage: deps.storage,
    userId: deps.userId,
    profileId: profile.id,
    snapshotId: snapshot.id,
    bytes,
    pages,
  });
}
