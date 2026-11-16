import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "./documents-repository";

/**
 * The opening a generation writes for, through its document's application;
 * null for a library document, which belongs to no application.
 */
export async function openingOfGeneration(db: DbClient, generationId: string) {
  const repository = new DocumentsRepository(db);
  const generation = await repository.findGeneration(generationId);
  const document =
    generation && (await repository.findDocument(generation.documentId));
  const application = document?.applicationId
    ? await repository.findApplication(document.applicationId)
    : null;
  return application?.openingId ?? null;
}
