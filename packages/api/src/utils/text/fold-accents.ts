/** Strips diacritics ("Sênior" → "Senior") so comparisons ignore accents. */
export function foldAccents(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
