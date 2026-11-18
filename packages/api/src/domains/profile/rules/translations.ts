import type { ProfileBlock } from "../truth/blocks";
import { type ProfileLanguage, translationLanguageOf } from "../truth/sections";
import { splitLabel } from "../truth/structure";
import { parsePublicNames } from "./public-names";

/** An entry of the profile's translations dictionary. */
export type Translation = { original: string; translation: string };

/** The dictionary, by the target language of each line. */
export type ProfileTranslations = Partial<
  Record<ProfileLanguage, Translation[]>
>;

/**
 * Reads the value of a translations line (profile spec, "Communication
 * rules"): the same shape as the public names line, `original →
 * translation`, entries split on `;` only. An entry missing a side is
 * returned apart, for the linter.
 */
export function parseTranslations(value: string) {
  const { entries, malformed } = parsePublicNames(value);
  return {
    entries: entries.map(
      (entry): Translation => ({
        original: entry.original,
        translation: entry.public,
      })
    ),
    malformed,
  };
}

/**
 * The values of the translations lines of a rules section, each with its
 * target language and the block it is on: the entries written on the line
 * itself (`;`-separated) and those written as sub-items under it.
 */
export function translationValues(
  blocks: ProfileBlock[],
  section: { start: number; end: number }
) {
  const values: Array<{
    line: number;
    language: ProfileLanguage;
    value: string;
  }> = [];
  let language: ProfileLanguage | null = null;
  for (let line = section.start; line < section.end; line++) {
    const block = blocks[line];
    if (block.type !== "item") continue;
    if (block.depth === 0) {
      const labelled = splitLabel(block.text);
      language = labelled ? translationLanguageOf(labelled.label) : null;
      if (language && labelled?.value.trim()) {
        values.push({ line, language, value: labelled.value });
      }
    } else if (language && block.text.trim()) {
      values.push({ line, language, value: block.text });
    }
  }
  return values;
}

/** How a field is compared with an entry: whole, case and spacing aside. */
export function translationKey(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * A code-printed field in the dictionary's language: the entry whose
 * original is the whole field (case-insensitively), or the field as
 * written. Entries change wording only; a figure in the field is the
 * user's, and an entry never adds one.
 */
export function translateField(entries: Translation[], text: string) {
  const key = translationKey(text);
  if (!key) return text;
  const entry = entries.find((row) => translationKey(row.original) === key);
  return entry ? entry.translation : text;
}

/** Whether a text is an entry's translation, as the dictionary wrote it. */
export function isTranslationOf(entries: Translation[], text: string) {
  const key = translationKey(text);
  return entries.some((row) => translationKey(row.translation) === key);
}
