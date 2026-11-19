import { z } from "zod";

import type { OutputLanguage } from "../schemas/document";

/** LinkedIn's fixed language proficiency scale, lowest first. */
export const linkedinProficiencies = [
  "elementary",
  "limited_working",
  "professional_working",
  "full_professional",
  "native_or_bilingual",
] as const;
export const linkedinProficiencySchema = z.enum(linkedinProficiencies);
export type LinkedinProficiency = z.infer<typeof linkedinProficiencySchema>;

// A level's words, accents aside, checked from the highest level down so
// "C1" in "fluente (C1)" and "nativo" win over anything lower.
const levelWords: Array<[LinkedinProficiency, RegExp]> = [
  ["native_or_bilingual", /\b(nativ[oa]|native|bilingue|bilingual)\b/],
  ["full_professional", /\b(c1|c2|fluente|fluent|proficiente|proficient)\b/],
  ["professional_working", /\b(b2|avancad[oa]|advanced|upper.intermediate)\b/],
  ["limited_working", /\b(b1|intermediari[oa]|intermediate)\b/],
  ["elementary", /\b(a1|a2|basic[oa]?|elementary|beginner|iniciante)\b/],
];

/**
 * A profile's language level on LinkedIn's scale (resume spec, "LinkedIn"):
 * CEFR codes and the common level words in Portuguese and English. Null
 * when it can't be read, for the user to pick.
 */
export function proficiencyOf(
  level: string | null
): LinkedinProficiency | null {
  if (!level) return null;
  const text = level.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return levelWords.find(([, words]) => words.test(text))?.[0] ?? null;
}

const labels: Record<OutputLanguage, Record<LinkedinProficiency, string>> = {
  "en-US": {
    elementary: "Elementary proficiency",
    limited_working: "Limited working proficiency",
    professional_working: "Professional working proficiency",
    full_professional: "Full professional proficiency",
    native_or_bilingual: "Native or bilingual proficiency",
  },
  "pt-BR": {
    elementary: "Nível básico",
    limited_working: "Proficiência limitada",
    professional_working: "Proficiência profissional",
    full_professional: "Proficiência profissional completa",
    native_or_bilingual: "Proficiência nativa ou bilíngue",
  },
};

/** A level as LinkedIn names it in the output language. */
export const proficiencyLabel = (
  proficiency: LinkedinProficiency,
  language: OutputLanguage
) => labels[language][proficiency];
