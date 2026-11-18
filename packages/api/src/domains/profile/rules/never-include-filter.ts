import { foldAccents } from "@repo/api/utils/text/fold-accents";

export type NeverIncludeRule = {
  original: string;
  // Null until the user reviews the item: hidden like an exclusion meanwhile.
  choice: "use" | "generalize" | "exclude" | null;
  generalized?: string | null;
};

const OMITTED = "[omitted]";

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The "never include" rules of the user's communication rules, applied by
 * code before and after every AI call (principle 4): what goes into a
 * prompt is rewritten, and an output still carrying a generalized or excluded original is rejected.
 */
export function createNeverIncludeFilter(rules: NeverIncludeRule[]) {
  // Longest first, so "Banco X Seguros" wins over "Banco X".
  const hidden = rules
    .filter((rule) => rule.choice !== "use" && rule.original.trim())
    .sort((a, b) => b.original.length - a.original.length);

  // Accent-insensitive matching on folded text, keeping positions. The
  // boundaries depend on how the term starts and ends: a figure never
  // matches inside another number or an id ("4" in "2024" or "7b441bc9")
  // but does with a unit ("1.5M", "40k"); a name never matches inside a
  // word ("Rio" in "Mario") but does in the plural.
  const patternFor = (original: string) => {
    const term = foldAccents(original.trim());
    const startsWith = (pattern: RegExp) => pattern.test(term.slice(0, 1));
    const endsWith = (pattern: RegExp) => pattern.test(term.slice(-1));
    const before = startsWith(/\p{N}/u)
      ? String.raw`(?<![\p{L}\p{N}]|\p{N}[.,])`
      : startsWith(/\p{L}/u)
        ? String.raw`(?<!\p{L})`
        : "";
    const after = endsWith(/\p{N}/u)
      ? String.raw`(?![.,]?\p{N})(?=[kmbx%]?(?![\p{L}\p{N}]))`
      : endsWith(/\p{L}/u)
        ? String.raw`(?=(?:s|'s)?(?!\p{L}))`
        : "";
    return new RegExp(`${before}${escapeRegExp(term)}${after}`, "giu");
  };

  function replaceAll(
    text: string,
    rule: NeverIncludeRule,
    replacement: string
  ) {
    const folded = foldAccents(text);
    let result = "";
    let cursor = 0;
    for (const match of folded.matchAll(patternFor(rule.original))) {
      result += text.slice(cursor, match.index) + replacement;
      cursor = match.index + match[0].length;
    }
    return result + text.slice(cursor);
  }

  function mentions(text: string, rule: NeverIncludeRule) {
    return patternFor(rule.original).test(foldAccents(text));
  }

  return {
    /** Rewrites text before it enters a prompt. */
    apply(text: string) {
      return hidden.reduce(
        (current, rule) =>
          replaceAll(
            current,
            rule,
            rule.choice === "generalize" && rule.generalized
              ? rule.generalized
              : OMITTED
          ),
        text
      );
    },

    /** Facts that rest on an excluded item are left out entirely. */
    dropFactsMentioningExcluded(facts: string[]) {
      const excluded = hidden.filter((rule) => rule.choice === "exclude");
      return facts.filter(
        (fact) => !excluded.some((rule) => mentions(fact, rule))
      );
    },

    findForbiddenTerms(output: string) {
      return hidden
        .filter((rule) => mentions(output, rule))
        .map((rule) => rule.original)
        .sort();
    },

    /** Throws when an AI output still carries a hidden original. */
    assertClean(output: string) {
      const found = this.findForbiddenTerms(output);
      if (found.length > 0) {
        throw new ForbiddenTermError(found.length);
      }
    },
  };
}

export type NeverIncludeFilter = ReturnType<typeof createNeverIncludeFilter>;

/** Carries only a count: the terms themselves must never reach a log. */
export class ForbiddenTermError extends Error {
  constructor(count: number) {
    super(`Output contains ${count} forbidden term(s)`);
    this.name = "ForbiddenTermError";
  }
}
