import type { OutputLanguage } from "../schemas/document";
import type { DocumentContent } from "../schemas/document-content";
import { renderLetterFitted } from "./letter-pdf";
import { renderResumeFitted } from "./resume-pdf";

/** A document's PDF in its own layout: a resume's or a cover letter's. */
export function renderDocumentPdf(input: {
  content: DocumentContent;
  language: OutputLanguage;
  /** The page limits of the document's settings. */
  maxPages: { resumeMaxPages: number; letterMaxPages: number };
}) {
  if (input.content.kind === "linkedin") {
    throw new Error("LinkedIn text has no PDF: it is copied, never exported");
  }
  return input.content.kind === "resume"
    ? renderResumeFitted({
        content: input.content,
        language: input.language,
        maxPages: input.maxPages.resumeMaxPages,
      })
    : renderLetterFitted(input.content, input.maxPages.letterMaxPages);
}
