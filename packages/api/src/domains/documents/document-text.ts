import { resumeLines, resumeText } from "./generation/resume-checks";
import { letterText } from "./letter/assemble-letter";
import type { DocumentContent } from "./schemas/document-content";

/** A document as plain text: what vectors and copying read. */
export const documentText = (content: DocumentContent) =>
  content.kind === "resume" ? resumeText(content) : letterText(content);

/** A document's lines with their origins: bullets, groups or paragraphs. */
export const documentLines = (content: DocumentContent) =>
  content.kind === "resume" ? resumeLines(content) : content.paragraphs;
