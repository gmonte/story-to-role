import type { OutputLanguage } from "../schemas/document";
import type { DocumentContent } from "../schemas/document-content";
import { renderLetterPdf } from "./letter-pdf";
import { renderResumePdf } from "./resume-pdf";

/** A document's PDF in its own layout: a resume's or a cover letter's. */
export function renderDocumentPdf(input: {
  content: DocumentContent;
  language: OutputLanguage;
}) {
  if (input.content.kind === "linkedin") {
    throw new Error("LinkedIn text has no PDF: it is copied, never exported");
  }
  return input.content.kind === "resume"
    ? renderResumePdf({ content: input.content, language: input.language })
    : renderLetterPdf(input.content);
}
