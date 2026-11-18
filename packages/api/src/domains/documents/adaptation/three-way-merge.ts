import { z } from "zod";

import { linkedinAsResume } from "../linkedin/linkedin-resume";
import type { Line } from "../schemas/document";
import type { DocumentContent } from "../schemas/document-content";
import type { ResumeContent, ResumeSection } from "../schemas/resume-content";

/** A line with the list it lives in ("summary", "experience:<id>"…). */
type Placed = { line: Line; container: string; index: number };

function placedLines(content: DocumentContent): Map<string, Placed> {
  const placed = new Map<string, Placed>();
  const put = (container: string, lines: Line[]) =>
    lines.forEach((line, index) =>
      placed.set(line.id, { line, container, index })
    );
  if (content.kind === "cover_letter") {
    put("letter", content.paragraphs);
    return placed;
  }
  if (content.kind === "linkedin")
    return placedLines(linkedinAsResume(content));
  for (const section of content.sections) {
    switch (section.kind) {
      case "summary":
        put("summary", [section.line]);
        break;
      case "skills":
        put("skills", section.groups);
        break;
      case "experience":
        section.entries.forEach((entry) =>
          put(`experience:${entry.positionId}`, entry.lines)
        );
        break;
      case "projects":
        section.entries.forEach((entry) =>
          put(`projects:${entry.projectId}`, entry.lines)
        );
        break;
    }
  }
  return placed;
}

/** One change found in the source since the base (resume spec, "Language sync"). */
export const syncChangeSchema = z.object({
  lineId: z.string(),
  kind: z.enum(["changed", "added", "removed"]),
  before: z.string().nullable(),
  after: z.string().nullable(),
  // The target's current wording of that line, if it has one.
  targetText: z.string().nullable(),
  // The target changed the same line since it last received changes.
  conflict: z.boolean(),
});
export type SyncChange = z.infer<typeof syncChangeSchema>;

/**
 * The three-way comparison of language sync, line by line: what the source
 * changed since the base (the source snapshot the target last came from),
 * and whether the target changed the same line since then. Lines keep
 * their ids across adaptations, which is what pairs them up.
 */
export function syncChanges(input: {
  base: ResumeContent;
  source: ResumeContent;
  targetBase: ResumeContent;
  target: ResumeContent;
}): SyncChange[] {
  const base = placedLines(input.base);
  const source = placedLines(input.source);
  const targetBase = placedLines(input.targetBase);
  const target = placedLines(input.target);
  const containers = new Set([...target.values()].map((row) => row.container));
  // An entry the target lacks (say, a position left out there) cannot take
  // the line; the summary always can.
  const placeable = (container: string) =>
    container === "summary" || containers.has(container);
  const targetChanged = (lineId: string) =>
    target.get(lineId)?.line.text !== targetBase.get(lineId)?.line.text;
  const changes: SyncChange[] = [];

  for (const [lineId, { line, container }] of source) {
    const before = base.get(lineId)?.line;
    if (!before) {
      if (!target.has(lineId) && placeable(container)) {
        changes.push({
          lineId,
          kind: "added",
          before: null,
          after: line.text,
          targetText: null,
          conflict: false,
        });
      }
    } else if (before.text !== line.text) {
      changes.push({
        lineId,
        kind: "changed",
        before: before.text,
        after: line.text,
        targetText: target.get(lineId)?.line.text ?? null,
        conflict: targetChanged(lineId),
      });
    }
  }
  for (const [lineId, { line }] of base) {
    if (source.has(lineId) || !target.has(lineId)) continue;
    changes.push({
      lineId,
      kind: "removed",
      before: line.text,
      after: null,
      targetText: target.get(lineId)!.line.text,
      conflict: targetChanged(lineId),
    });
  }
  return changes;
}

/**
 * Applies the selected changes to the target: changed lines take their
 * adapted wording, added lines go after the line that precedes them in
 * the source, removed lines leave. Everything else keeps the target's own
 * wording. A change without adapted wording is skipped.
 */
export function mergeSync(input: {
  source: ResumeContent;
  target: ResumeContent;
  changes: SyncChange[];
  adapted: Map<string, string>;
}): ResumeContent {
  const source = placedLines(input.source);
  const byId = new Map(input.changes.map((change) => [change.lineId, change]));
  const additions = input.changes.filter(
    (change) => change.kind === "added" && input.adapted.has(change.lineId)
  );

  const mergeLines = <T extends Line>(container: string, lines: T[]): T[] => {
    const merged = lines.flatMap((line): T[] => {
      const change = byId.get(line.id);
      if (change?.kind === "removed") return [];
      const text = change?.kind === "changed" && input.adapted.get(line.id);
      return [text ? { ...line, text } : line];
    });
    for (const addition of additions) {
      const placed = source.get(addition.lineId);
      if (placed?.container !== container) continue;
      const added = {
        ...placed.line,
        text: input.adapted.get(addition.lineId)!,
      } as T;
      // After the nearest preceding source line the target has.
      const siblings = [...source.values()]
        .filter(
          (row) => row.container === container && row.index < placed.index
        )
        .sort((a, b) => b.index - a.index);
      const anchor = siblings.find((row) =>
        merged.some((line) => line.id === row.line.id)
      );
      const at = anchor
        ? merged.findIndex((line) => line.id === anchor.line.id) + 1
        : 0;
      merged.splice(at, 0, added);
    }
    return merged;
  };

  return {
    ...input.target,
    sections: input.target.sections.flatMap((section): ResumeSection[] => {
      switch (section.kind) {
        case "summary": {
          const [line] = mergeLines("summary", [section.line]);
          return line ? [{ ...section, line }] : [];
        }
        case "skills":
          return [{ ...section, groups: mergeLines("skills", section.groups) }];
        case "experience":
          return [
            {
              ...section,
              entries: section.entries.map((entry) => ({
                ...entry,
                lines: mergeLines(
                  `experience:${entry.positionId}`,
                  entry.lines
                ),
              })),
            },
          ];
        case "projects":
          return [
            {
              ...section,
              entries: section.entries.map((entry) => ({
                ...entry,
                lines: mergeLines(`projects:${entry.projectId}`, entry.lines),
              })),
            },
          ];
        default:
          return [section];
      }
    }),
  };
}

/** What a proposal changes in its target, line by line, to review. */
export function proposalDiff(before: DocumentContent, after: DocumentContent) {
  const old = placedLines(before);
  const proposed = placedLines(after);
  const changed = [...proposed.values()]
    .filter(({ line }) => old.get(line.id)?.line.text !== line.text)
    .map(({ line }) => ({
      lineId: line.id,
      before: old.get(line.id)?.line.text ?? null,
      after: line.text as string | null,
    }));
  const removed = [...old.values()]
    .filter(({ line }) => !proposed.has(line.id))
    .map(({ line }) => ({ lineId: line.id, before: line.text, after: null }));
  return [...changed, ...removed];
}
