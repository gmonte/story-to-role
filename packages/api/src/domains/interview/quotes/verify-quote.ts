/**
 * Principle 2 in code: a fact may only rest on words that exist in its
 * source. Returns the quote exactly as it appears in the source (so the
 * approval screen shows the user's own words), or null when the source
 * doesn't contain it. Whitespace and case may differ; wording may not.
 */
export function findQuote(source: string, quote: string): string | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const pattern = new RegExp(
    words
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+"),
    "i"
  );
  const match = pattern.exec(source);
  return match ? match[0] : null;
}
