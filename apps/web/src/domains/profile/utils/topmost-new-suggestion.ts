type Located = { id: string; range: { start: number } | null };

/**
 * The suggestion to scroll to after an agent turn: of those not there
 * before it, the one whose lines come first in the document. Suggestions
 * whose lines were edited away have no place to go to.
 */
export function topmostNewSuggestion<T extends Located>(
  previousIds: ReadonlySet<string>,
  suggestions: T[]
): T | null {
  let found: T | null = null;
  for (const suggestion of suggestions) {
    if (previousIds.has(suggestion.id) || !suggestion.range) continue;
    if (!found || suggestion.range.start < found.range!.start) {
      found = suggestion;
    }
  }
  return found;
}
