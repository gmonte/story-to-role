import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "../documents-repository";
import type { DocumentKind, OutputLanguage } from "../schemas/document";
import type { DocumentContent } from "../schemas/document-content";
import { documentFileName } from "./file-names";

/**
 * Suggested PDF names for one document's versions: `<Title>` is the
 * opening's title, or a library document's focus, read once; the name is
 * the one printed on each version.
 */
export async function fileNamer(
  tx: DbClient,
  cipher: UserCipher,
  document: {
    kind: DocumentKind;
    applicationId: string | null;
    encryptedFocus: string | null;
  }
) {
  const application = document.applicationId
    ? await new DocumentsRepository(tx).findApplication(document.applicationId)
    : null;
  const opening = application
    ? await new OpeningsRepository(tx).findOpeningById(application.openingId)
    : null;
  const encrypted = opening?.encryptedTitle ?? document.encryptedFocus;
  const title = encrypted ? cipher.decrypt(encrypted) : null;
  return (version: { language: OutputLanguage }, content: DocumentContent) =>
    documentFileName({
      kind: document.kind,
      language: version.language,
      name: content.header.name,
      title,
    });
}
