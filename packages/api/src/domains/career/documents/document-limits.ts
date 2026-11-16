/** Input limits in code (guided interview spec, guardrail 2). */
export const documentLimits = {
  maxBytes: 5 * 1024 * 1024,
  maxPages: 20,
  // About 12,000 words, the size the billing spec prices a truth file at.
  maxCharacters: 80_000,
  minCharacters: 200,
  // Resume versions, a LinkedIn PDF, a summary: enough to tell a career.
  maxSources: 5,
};

/** Sources that take one of the slots: rejected or failed ones don't. */
export const slotStatuses = ["pending", "processing", "processed"] as const;

export const acceptedDocumentTypes = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "text/markdown": "text",
  "text/plain": "text",
} as const;

export type AcceptedDocumentType = keyof typeof acceptedDocumentTypes;

export const typesByExtension: Record<string, AcceptedDocumentType> = {
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

/**
 * Whether the bytes are what the type claims, so a renamed file is refused:
 * a PDF header, a DOCX's ZIP container, or text that is valid UTF-8 with no
 * null bytes.
 */
export function hasExpectedContent(
  bytes: Buffer,
  mimeType: AcceptedDocumentType
) {
  switch (acceptedDocumentTypes[mimeType]) {
    case "pdf":
      // PDF readers accept a header within the first kilobyte.
      return bytes.subarray(0, 1024).includes("%PDF-");
    case "docx":
      return bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    case "text":
      if (bytes.includes(0)) return false;
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return true;
      } catch {
        return false;
      }
  }
}

export function isAcceptedDocumentType(
  mimeType: string
): mimeType is AcceptedDocumentType {
  return mimeType in acceptedDocumentTypes;
}
