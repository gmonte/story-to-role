import {
  type ProfileTranslations,
  type Translation,
  translateField,
} from "@repo/api/domains/profile/rules/translations";
import type { ProfileLanguage } from "@repo/api/domains/profile/truth/sections";

import type { OutputLanguage } from "../schemas/document";
import { translateLanguageTerm } from "./language-terms";

/**
 * How code prints a profile field in a document's language (resume spec,
 * "Output language"): in the profile's own language, as written; in
 * another, through the profile's translations dictionary for that language
 * (exact, whole-field entries) and, for a Languages line, the built-in
 * dictionary of language names and levels first. Nothing is translated
 * when the document is in the profile's language.
 */
export function printedFields(input: {
  profileLanguage: ProfileLanguage | null;
  language: OutputLanguage | undefined;
  translations: ProfileTranslations;
}) {
  const active =
    !!input.language &&
    !!input.profileLanguage &&
    input.language !== input.profileLanguage;
  const dictionary: Translation[] = active
    ? (input.translations[input.language!] ?? [])
    : [];
  const field = (text: string) =>
    active ? translateField(dictionary, text) : text;
  // The profile's own entry, written against the original, wins; then the
  // built-in names and levels, and the dictionary again on their result.
  const languageTerm = (text: string) => {
    if (!active) return text;
    const own = translateField(dictionary, text);
    if (own !== text) return own;
    return translateField(
      dictionary,
      translateLanguageTerm(text, input.language!)
    );
  };
  return {
    active,
    dictionary,
    field,
    nullableField: (text: string | null) =>
      text === null ? null : field(text),
    languageTerm,
    nullableLanguageTerm: (text: string | null) =>
      text === null ? null : languageTerm(text),
    /**
     * A Languages line: an entry for the whole line as the profile prints
     * it (“Inglês (proficiência profissional C1)”) replaces it whole;
     * otherwise its name and level are printed one by one.
     */
    languageLine: (title: string, level: string | null) => {
      if (active) {
        const whole = level ? `${title} (${level})` : title;
        const own = translateField(dictionary, whole);
        if (own !== whole) return { title: own, level: null };
      }
      return {
        title: languageTerm(title),
        level: level === null ? null : languageTerm(level),
      };
    },
  };
}
