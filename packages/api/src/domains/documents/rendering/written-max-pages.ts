import type { DocumentsRepository } from "../documents-repository";
import {
  defaultGenerationSettings,
  generationSettingsSchema,
} from "../schemas/generation-settings";

/**
 * The page limits a document was written under: its version's latest
 * generation, else the document's latest written one, else the defaults.
 */
export async function writtenMaxPages(
  documents: DocumentsRepository,
  input: { documentId: string; versionId: string | null }
) {
  const written = input.versionId
    ? await documents.latestWrittenGeneration(input.versionId)
    : null;
  const raw =
    written?.settings ?? (await documents.writtenSettings(input.documentId));
  const settings = generationSettingsSchema
    .catch(defaultGenerationSettings)
    .parse(raw ?? defaultGenerationSettings);
  return {
    resumeMaxPages: settings.resumeMaxPages,
    letterMaxPages: settings.letterMaxPages,
  };
}
