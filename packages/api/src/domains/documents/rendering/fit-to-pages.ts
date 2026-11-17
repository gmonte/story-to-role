import { trimToPages } from "../generation/resume-checks";
import type { OutputLanguage } from "../schemas/document";
import type { ExperienceAge } from "../schemas/generation-settings";
import type { ResumeContent } from "../schemas/resume-content";
import { renderResumePdf } from "./resume-pdf";

/**
 * Makes a resume fit its page limit in the real PDF (resume spec,
 * "Generation settings"): the estimate shortens first, then each render
 * that still runs over shortens one step more, in the settings' order and
 * rewriting nothing. Returns the content with the PDF it renders to, ready
 * to cache; `fits` is false when only recent experiences were left to cut,
 * and the user is warned instead.
 */
export async function fitToPages(input: {
  content: ResumeContent;
  language: OutputLanguage;
  maxPages: number;
  ages: Map<string, ExperienceAge>;
}) {
  const { maxPages, ages } = input;
  let content = trimToPages(input.content, maxPages, ages);
  let target = maxPages;
  for (;;) {
    const rendered = await renderResumePdf({
      content,
      language: input.language,
    });
    if (rendered.pages <= maxPages) return { content, fits: true, ...rendered };
    // Aim the estimate lower until it shortens something more.
    let trimmed = content;
    while (trimmed === content && target > 0) {
      target -= 0.05;
      trimmed = trimToPages(content, target, ages);
    }
    // Nothing left to cut: the user sees the length warning.
    if (trimmed === content) return { content, fits: false, ...rendered };
    content = trimmed;
  }
}
