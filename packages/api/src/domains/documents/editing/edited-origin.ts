import type { Line, LineOrigin } from "../schemas/document";

/**
 * Whether two texts say the same thing: whitespace, punctuation and
 * symbols aside. A space added or a comma moved is not an edit (resume
 * spec, "Trace in the editor").
 */
export const sameWords = (a: string, b: string) =>
  a.replace(/[\p{P}\p{S}\s]+/gu, "") === b.replace(/[\p{P}\p{S}\s]+/gu, "");

/**
 * The origin of a traced line the user reworded: "edited", carrying the
 * sources of the line it came from, so the trace survives the edit. A
 * line with nothing to trace (typed by the user, or accepted from the
 * agent without passages) stays "written by you".
 */
export function editedOrigin(origin: LineOrigin): LineOrigin {
  switch (origin.kind) {
    case "manual":
    case "credential":
      return origin;
    case "evidence":
    case "skill":
      return origin.evidenceIds.length
        ? {
            kind: "edited",
            evidenceIds: origin.evidenceIds,
            instructionIds: [],
            companyFactIds: [],
            motivationPointIds: [],
          }
        : { kind: "manual" };
    case "instruction":
      return {
        kind: "edited",
        evidenceIds: origin.evidenceIds,
        instructionIds: origin.instructionIds,
        companyFactIds: [],
        motivationPointIds: [],
      };
    case "letter":
    case "edited": {
      const traced =
        origin.evidenceIds.length ||
        origin.instructionIds.length ||
        origin.companyFactIds.length ||
        origin.motivationPointIds.length;
      return traced ? { ...origin, kind: "edited" } : { kind: "manual" };
    }
  }
}

/**
 * A line as the user's edit leaves it: untouched (or only its spacing and
 * punctuation changed), it keeps its origin; reworded, its origin becomes
 * "edited" with the same sources; new, it is "written by you".
 */
export function markEditedLine<T extends Line>(line: T, old?: Line): T {
  if (!old) return { ...line, origin: { kind: "manual" } };
  if (sameWords(old.text, line.text)) return { ...line, origin: old.origin };
  return { ...line, origin: editedOrigin(old.origin) };
}
