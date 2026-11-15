import { foldAccents } from "@repo/api/utils/text/fold-accents";

import type { SensitivityChoice } from "../schemas/evidence";

export type SensitiveRule = {
  original: string;
  // Null until the user reviews the item: hidden like an exclusion meanwhile.
  choice: SensitivityChoice | null;
  generalized?: string | null;
};

const OMITTED = "[omitted]";

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The user's sensitivity choices, applied by code before and after every AI
 * call (principle 4): what goes into a prompt is rewritten, and an output
 * still carrying a generalized or excluded original is rejected.
 */
export function createSensitiveFilter(rules: SensitiveRule[]) {
  // Longest first, so "Banco X Seguros" wins over "Banco X".
  const hidden = rules
    .filter((rule) => rule.choice !== "use" && rule.original.trim())
    .sort((a, b) => b.original.length - a.original.length);

  // Accent-insensitive matching: compare on folded text, keep positions.
  const patternFor = (original: string) =>
    new RegExp(escapeRegExp(foldAccents(original)), "gi");

  function replaceAll(text: string, rule: SensitiveRule, replacement: string) {
    const folded = foldAccents(text);
    let result = "";
    let cursor = 0;
    for (const match of folded.matchAll(patternFor(rule.original))) {
      result += text.slice(cursor, match.index) + replacement;
      cursor = match.index + match[0].length;
    }
    return result + text.slice(cursor);
  }

  function mentions(text: string, rule: SensitiveRule) {
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

export type SensitiveFilter = ReturnType<typeof createSensitiveFilter>;

/** Carries only a count: the terms themselves must never reach a log. */
export class ForbiddenTermError extends Error {
  constructor(count: number) {
    super(`Output contains ${count} forbidden term(s)`);
    this.name = "ForbiddenTermError";
  }
}
