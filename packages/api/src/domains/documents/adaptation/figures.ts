/**
 * The figures of a text with separators dropped, so "1.5M" and "1,5M"
 * (or "2,000" and "2.000") count as the same figure across languages.
 */
export function figuresOf(text: string) {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((figure) =>
    figure.replace(/[.,]/g, "")
  );
}

/** Rewording into another language adds no figure and converts none. */
export function keepsFigures(source: string, rewritten: string) {
  const allowed = new Set(figuresOf(source));
  return figuresOf(rewritten).every((figure) => allowed.has(figure));
}
