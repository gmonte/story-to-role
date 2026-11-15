/** Input limits in code (guided interview spec, guardrail 2). */
export const documentLimits = {
  maxBytes: 5 * 1024 * 1024,
  maxPages: 20,
  // About 12,000 words, the size the billing spec prices a truth file at.
  maxCharacters: 80_000,
  minCharacters: 200,
};

export const acceptedDocumentTypes = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "text/markdown": "text",
  "text/plain": "text",
} as const;

export type AcceptedDocumentType = keyof typeof acceptedDocumentTypes;

const typesByExtension: Record<string, AcceptedDocumentType> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown",
  txt: "text/plain",
};

/** Browsers often send no type for .md files: fall back to the extension. */
export function documentTypeOf(input: { fileName: string; mimeType: string }) {
  if (input.mimeType in acceptedDocumentTypes) return input.mimeType;
  const extension = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  return typesByExtension[extension] ?? input.mimeType;
}

export function isAcceptedDocumentType(
  mimeType: string
): mimeType is AcceptedDocumentType {
  return mimeType in acceptedDocumentTypes;
}
