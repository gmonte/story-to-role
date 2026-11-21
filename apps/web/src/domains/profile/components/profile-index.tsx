"use client";

import { useTranslation } from "@repo/intl/use-translation";
import { cn } from "@repo/web/lib/utils";

import { useActiveLine } from "../hooks/use-active-line";
import { useProfileEditor } from "./profile-editor-context";

// The profile's own separator, not a translated word.
const titleSeparator = " — ";

/**
 * The document's index (profile spec, "The editor"): its sections and, under
 * Experience, each position; a dot marks a section with format findings.
 */
export function ProfileIndex() {
  const t = useTranslation();
  const { blocks, structure, findings, goToLine, editor } = useProfileEditor();
  // The section (or position) being read is marked, as in a table of
  // contents that follows the page.
  const active = useActiveLine(
    editor,
    structure.sections.flatMap((section) => [
      section.heading,
      ...(section.key === "experience"
        ? structure.experiences.map((experience) => experience.heading)
        : []),
    ])
  );

  const formatLines = new Set(
    findings
      .filter((f) => f.kind === "format" && f.line !== null)
      .map((f) => f.line)
  );
  const hasFormat = (start: number, end: number) =>
    [...formatLines].some(
      (line) => line !== null && line >= start && line < end
    );

  return (
    <nav aria-label={t.formatMessage({ defaultMessage: "Profile index" })}>
      <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
        {t.formatMessage({ defaultMessage: "Index" })}
      </p>
      <ul className="space-y-0.5 text-sm">
        {structure.sections.map((section) => {
          const block = blocks[section.heading];
          const title = block?.text.replace(/\s*\(.*\)$/, "") ?? "";
          const experiences =
            section.key === "experience" ? structure.experiences : [];
          return (
            <li key={section.heading}>
              <button
                type="button"
                onClick={() => goToLine(section.heading)}
                aria-current={
                  active === section.heading ? "location" : undefined
                }
                className={cn(
                  "hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1 text-left",
                  !section.key && "text-muted-foreground italic",
                  active === section.heading && "bg-accent font-medium"
                )}
              >
                <span className="truncate">{title}</span>
                {hasFormat(section.heading, section.end) && (
                  <span className="bg-destructive size-1.5 shrink-0 rounded-full" />
                )}
              </button>
              {experiences.length > 0 && (
                <ul className="border-muted ml-3 border-l pl-2">
                  {experiences.map((experience) => (
                    <li key={experience.heading}>
                      <button
                        type="button"
                        onClick={() => goToLine(experience.heading)}
                        aria-current={
                          active === experience.heading ? "location" : undefined
                        }
                        className={cn(
                          "text-muted-foreground hover:bg-accent hover:text-foreground w-full truncate rounded px-2 py-0.5 text-left text-xs",
                          active === experience.heading &&
                            "bg-accent text-foreground font-medium"
                        )}
                      >
                        {experience.parsed
                          ? [
                              experience.parsed.company,
                              experience.parsed.title,
                            ].join(titleSeparator)
                          : experience.rawTitle}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
