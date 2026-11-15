import { maxResumePages, trimToPages } from "../generation/resume-checks";
import type { OutputLanguage } from "../schemas/document";
import type { ResumeContent } from "../schemas/resume-content";
import { renderResumePdf } from "./resume-pdf";

/**
 * Makes a resume fit in two pages of the real PDF (resume spec, "Layout"):
 * the estimate trims first, then each render that still runs over drops
 * the last bullet of the oldest positions, rewriting nothing. Returns the
 * content with the PDF it renders to, ready to cache.
 */
export async function fitToPages(input: {
  content: ResumeContent;
  language: OutputLanguage;
  maxPages?: number;
}) {
  const maxPages = input.maxPages ?? maxResumePages;
  let content = trimToPages(input.content, maxPages);
  let target = maxPages;
  for (;;) {
    const rendered = await renderResumePdf({
      content,
      language: input.language,
    });
    if (rendered.pages <= maxPages) return { content, ...rendered };
    // Aim the estimate lower until it trims something more.
    let trimmed = content;
    while (trimmed === content && target > 0) {
      target -= 0.05;
      trimmed = trimToPages(content, target);
    }
    // Nothing left to trim: the user sees the length warning.
    if (trimmed === content) return { content, ...rendered };
    content = trimmed;
  }
}
