export type FoundLink = { from: number; to: number; href: string };

const emailPattern = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const schemePattern = /\bhttps?:\/\/[^\s<>]+/gi;
// `www.site.com` or `site.com/path`: a bare domain needs a path to count.
const barePattern =
  /(?<![\w@./:-])(?:www\.(?:[a-z0-9-]+\.)+[a-z]{2,}|(?:[a-z0-9-]+\.)+[a-z]{2,}(?=\/))(?:\/[^\s<>]*)?/gi;

/** Punctuation that ends a sentence rather than a link. */
function trimEnd(value: string) {
  let end = value.length;
  while (end > 0) {
    const char = value[end - 1];
    if (/[.,;:!?'"”’\]}]/.test(char)) end -= 1;
    else if (char === ")" && !value.slice(0, end).includes("(")) end -= 1;
    else break;
  }
  return end;
}

/**
 * The links in a line of text: http(s) URLs, bare `www.` and `domain/path`
 * addresses (given `https://`) and e-mail addresses (given `mailto:`).
 * Offsets are into `text`; trailing sentence punctuation is left out.
 */
export function findLinks(text: string): FoundLink[] {
  const found: FoundLink[] = [];
  const add = (pattern: RegExp, toHref: (value: string) => string) => {
    for (const match of text.matchAll(pattern)) {
      const from = match.index;
      const to = from + trimEnd(match[0]);
      if (to <= from) continue;
      if (found.some((link) => from < link.to && to > link.from)) continue;
      found.push({ from, to, href: toHref(text.slice(from, to)) });
    }
  };
  add(emailPattern, (value) => `mailto:${value}`);
  add(schemePattern, (value) => value);
  add(barePattern, (value) => `https://${value}`);
  return found.sort((a, b) => a.from - b.from);
}
