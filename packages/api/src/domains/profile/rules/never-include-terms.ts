const quotePairs: Array<[string, string]> = [
  ["“", "”"],
  ['"', '"'],
  ["'", "'"],
];

/**
 * Splits the value of a "never include" line into its items, on commas and
 * semicolons only (never on "e" / "and": a category is a phrase), outside
 * quotes and parentheses. A closing period is dropped.
 */
export function splitNeverIncludeItems(value: string) {
  const items: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (const char of value) {
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === "“") quote = "”";
    else if (char === '"') quote = '"';
    else if (char === "(") depth++;
    else if (char === ")" && depth) depth--;
    else if ((char === "," || char === ";") && !depth) {
      items.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  items.push(current);
  return items
    .map((item) => item.trim().replace(/\.$/, "").trim())
    .filter(Boolean);
}

function unquote(item: string) {
  for (const [open, close] of quotePairs) {
    if (item.length > 2 && item.startsWith(open) && item.endsWith(close)) {
      return item.slice(1, -1).trim();
    }
  }
  return null;
}

/**
 * A never-include item is a literal term (a name or value to hide: it has an
 * uppercase letter or a digit, or is quoted) or a category (an instruction
 * for the model, never matched as words). Returns the term, or null for a
 * category.
 */
export function literalTermOf(item: string) {
  const quoted = unquote(item.trim());
  if (quoted) return quoted;
  return /[\p{Lu}\p{N}]/u.test(item) ? item.trim() : null;
}

export function neverIncludeTerms(items: string[]) {
  return items.flatMap((item) => literalTermOf(item) ?? []);
}

export function neverIncludeCategories(items: string[]) {
  return items.filter((item) => literalTermOf(item) === null);
}
