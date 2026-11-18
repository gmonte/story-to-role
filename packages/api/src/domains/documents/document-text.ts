import { resumeLines, resumeText } from "./generation/resume-checks";
import { linkedinAsResume } from "./linkedin/linkedin-resume";
import { letterText } from "./letter/assemble-letter";
import type { DocumentContent } from "./schemas/document-content";

/** A document as plain text: what vectors and copying read. */
export const documentText = (content: DocumentContent) => {
  switch (content.kind) {
    case "resume":
      return resumeText(content);
    case "linkedin":
      return resumeText(linkedinAsResume(content));
    case "cover_letter":
      return letterText(content);
  }
};

/** A document's lines with their origins: bullets, groups or paragraphs. */
export const documentLines = (content: DocumentContent) => {
  switch (content.kind) {
    case "resume":
      return resumeLines(content);
    case "linkedin":
      return resumeLines(linkedinAsResume(content));
    case "cover_letter":
      return content.paragraphs;
  }
};
