import mammoth from "mammoth";
import { extractText } from "unpdf";

import {
  acceptedDocumentTypes,
  documentLimits,
  type AcceptedDocumentType,
} from "./document-limits";

export type ExtractedText =
  | { ok: true; text: string }
  | {
      ok: false;
      reason: "too_many_pages" | "too_long" | "too_short" | "unreadable";
    };

/**
 * PDF and DOCX become text by code (guided interview spec), so no provider
 * needs document input and the file itself never reaches a model.
 */
export async function extractDocumentText(input: {
  bytes: Buffer;
  mimeType: AcceptedDocumentType;
}): Promise<ExtractedText> {
  let text: string;

  try {
    switch (acceptedDocumentTypes[input.mimeType]) {
      case "pdf": {
        const pdf = await extractText(new Uint8Array(input.bytes), {
          mergePages: true,
        });
        if (pdf.totalPages > documentLimits.maxPages) {
          return { ok: false, reason: "too_many_pages" };
        }
        text = pdf.text;
        break;
      }
      case "docx":
        text = (await mammoth.extractRawText({ buffer: input.bytes })).value;
        break;
      case "text":
        text = input.bytes.toString("utf8");
        break;
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  const normalized = text
    .replaceAll("\u0000", "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalized.length > documentLimits.maxCharacters) {
    return { ok: false, reason: "too_long" };
  }
  if (normalized.length < documentLimits.minCharacters) {
    return { ok: false, reason: "too_short" };
  }
  return { ok: true, text: normalized };
}
