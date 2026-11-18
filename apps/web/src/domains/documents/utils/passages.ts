/** A review item's quote: the line it points at and the words it quotes. */
export type PassageTarget = { lineId: string | null; lineText: string | null };

/** A line of the text in the editor, as the review's quotes see it. */
export type PassageLine = { lineId?: string; text?: string };

const normalizeQuote = (text: string) =>
  text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Where a review quote sits among the lines: the line with its id, or
 * else the line whose text holds the quote (or is held by it), with
 * whitespace, case and quote marks aside. -1 when the text lost it.
 */
export function findPassage(
  lines: readonly PassageLine[],
  target: PassageTarget
) {
  const byId = target.lineId
    ? lines.findIndex((line) => line.lineId === target.lineId)
    : -1;
  if (byId >= 0 || !target.lineText) return byId;
  const quote = normalizeQuote(target.lineText);
  if (!quote) return -1;
  return lines.findIndex((line) => {
    if (!line.lineId || !line.text) return false;
    const text = normalizeQuote(line.text);
    return text.length > 0 && (text.includes(quote) || quote.includes(text));
  });
}
