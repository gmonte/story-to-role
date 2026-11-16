import mammoth from "mammoth";
import { getDocumentProxy, renderPageAsImage } from "unpdf";

import type { DocumentPreview } from "../schemas/timeline";
import {
  acceptedDocumentTypes,
  type AcceptedDocumentType,
} from "./document-limits";

/**
 * A source's read-only preview. The browser never receives the file itself:
 * a PDF becomes page images and anything else plain text, so no script a
 * file carries can run.
 */
export async function previewDocument(input: {
  bytes: Buffer;
  mimeType: AcceptedDocumentType;
}): Promise<DocumentPreview> {
  switch (acceptedDocumentTypes[input.mimeType]) {
    case "pdf": {
      const pdf = await getDocumentProxy(new Uint8Array(input.bytes));
      return { type: "pdf", pageCount: pdf.numPages };
    }
    case "docx":
      return {
        type: "text",
        text: (await mammoth.extractRawText({ buffer: input.bytes })).value,
      };
    case "text":
      return { type: "text", text: input.bytes.toString("utf8") };
  }
}

/** One PDF page as a PNG, rendered on the server; null past the last page. */
export async function renderPdfPage(input: { bytes: Buffer; page: number }) {
  // One parse serves the page count and the rendering.
  const pdf = await getDocumentProxy(new Uint8Array(input.bytes));
  if (input.page < 1 || input.page > pdf.numPages) return null;
  const png = await renderPageAsImage(pdf, input.page, {
    canvasImport: () => import("@napi-rs/canvas"),
    scale: 1.5,
  });
  return Buffer.from(png);
}
