/**
 * The figures of a text, with "," and "." as one separator, so "1.5M" and
 * "1,5M" (or "2,000" and "2.000") count as the same figure across
 * languages while "1.5" and "15" stay different.
 */
export function figuresOf(text: string) {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((figure) =>
    figure.replace(/,/g, ".")
  );
}

const currencies = /R\$|US\$|\$|€|£/g;

/**
 * Rewording into another language keeps the same figures (none added,
 * dropped or converted) and the same currency: no exchange rate is ever
 * invented.
 */
export function keepsFigures(source: string, rewritten: string) {
  const before = new Set(figuresOf(source));
  const after = new Set(figuresOf(rewritten));
  const sourceCurrencies = new Set(source.match(currencies) ?? []);
  return (
    before.size === after.size &&
    [...after].every((figure) => before.has(figure)) &&
    (rewritten.match(currencies) ?? []).every((symbol) =>
      sourceCurrencies.has(symbol)
    )
  );
}
