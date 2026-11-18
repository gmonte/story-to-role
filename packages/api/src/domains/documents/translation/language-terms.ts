import type { ProfileLanguage } from "@repo/api/domains/profile/truth/sections";
import { foldAccents } from "@repo/api/utils/text/fold-accents";

/**
 * The built-in dictionary for the profile's Languages lines (resume spec,
 * "Output language"): language names and the common level words, Brazilian
 * Portuguese ⇄ English, so a document in the other language never prints
 * “Português (nativo)”. CEFR codes (A1–C2) and any word not here stay as
 * written; the profile's translations dictionary runs after it.
 */
const pairs: Array<[pt: string, en: string]> = [
  // Language names.
  ["português", "portuguese"],
  ["português brasileiro", "brazilian portuguese"],
  ["português do brasil", "brazilian portuguese"],
  ["inglês", "english"],
  ["espanhol", "spanish"],
  ["francês", "french"],
  ["alemão", "german"],
  ["italiano", "italian"],
  ["japonês", "japanese"],
  ["mandarim", "mandarin"],
  ["chinês", "chinese"],
  ["coreano", "korean"],
  ["russo", "russian"],
  ["árabe", "arabic"],
  ["holandês", "dutch"],
  ["hebraico", "hebrew"],
  ["grego", "greek"],
  ["turco", "turkish"],
  ["polonês", "polish"],
  ["sueco", "swedish"],
  ["norueguês", "norwegian"],
  ["dinamarquês", "danish"],
  ["finlandês", "finnish"],
  ["hindi", "hindi"],
  ["libras", "brazilian sign language"],
  // Levels.
  ["nativo", "native"],
  ["nativa", "native"],
  ["língua materna", "mother tongue"],
  ["bilíngue", "bilingual"],
  ["fluente", "fluent"],
  ["avançado", "advanced"],
  ["avançada", "advanced"],
  ["intermediário", "intermediate"],
  ["intermediária", "intermediate"],
  ["intermediário avançado", "upper intermediate"],
  ["intermediário superior", "upper intermediate"],
  ["pré-intermediário", "pre-intermediate"],
  ["básico", "basic"],
  ["básica", "basic"],
  ["iniciante", "beginner"],
  ["elementar", "elementary"],
  ["proficiência nativa ou bilíngue", "native or bilingual proficiency"],
  ["proficiência profissional completa", "full professional proficiency"],
  ["proficiência profissional plena", "full professional proficiency"],
  ["proficiência profissional limitada", "limited professional proficiency"],
  ["proficiência profissional", "professional proficiency"],
  ["proficiência", "proficiency"],
  ["leitura técnica", "technical reading"],
  ["leitura", "reading"],
  ["escrita", "writing"],
  ["conversação", "conversation"],
  ["compreensão", "comprehension"],
  ["técnico", "technical"],
  ["técnica", "technical"],
  ["em estudo", "studying"],
  ["estudando", "studying"],
  ["nível", "level"],
  ["e", "and"],
  // A credential's status, printed as its level.
  ["válida", "valid"],
  ["válido", "valid"],
  ["expirada", "expired"],
  ["expirado", "expired"],
  ["em renovação", "renewing"],
  ["concluído", "completed"],
  ["concluída", "completed"],
  ["em andamento", "in progress"],
];

const key = (text: string) => foldAccents(text).toLowerCase().trim();

const toEnglish = new Map<string, string>();
const toPortuguese = new Map<string, string>();
for (const [pt, en] of pairs) {
  if (!toEnglish.has(key(pt))) toEnglish.set(key(pt), en);
  if (!toPortuguese.has(key(en))) toPortuguese.set(key(en), pt);
}

const dictionaries: Record<ProfileLanguage, Map<string, string>> = {
  "en-US": toEnglish,
  "pt-BR": toPortuguese,
};

/** The words the dictionary knows in one language, for the heuristics. */
export function knownLanguageTerms(language: ProfileLanguage) {
  return [...dictionaries[language === "pt-BR" ? "en-US" : "pt-BR"].keys()];
}

// A segment is a phrase between punctuation; a code like C1 stays.
const separators = /([,;/()–—-]|\s+)/;

function cased(source: string, target: string) {
  const first = source.trimStart()[0] ?? "";
  return first === first.toUpperCase() && first !== first.toLowerCase()
    ? target[0].toUpperCase() + target.slice(1)
    : target;
}

/**
 * A language name or level in the other language: each phrase between
 * punctuation whole when the dictionary has it (“proficiência profissional
 * completa”), else word by word (“fluente e avançado”); what it doesn't
 * know (a CEFR code, a school's name) stays as written.
 */
export function translateLanguageTerm(text: string, to: ProfileLanguage) {
  const dictionary = dictionaries[to];
  const phrases = text.split(/([,;/()–—]+)/);
  return phrases
    .map((phrase, index) => {
      if (index % 2 === 1) return phrase;
      const whole = dictionary.get(key(phrase));
      if (whole) {
        const lead = /^\s*/.exec(phrase)?.[0] ?? "";
        const trail = /\s*$/.exec(phrase)?.[0] ?? "";
        return `${lead}${cased(phrase, whole)}${trail}`;
      }
      // Each part around a conjunction whole (“leitura técnica”), else word
      // by word.
      return phrase
        .split(/(\s+(?:e|and)\s+)/i)
        .map((part, partIndex) => {
          if (partIndex % 2 === 1) {
            return part.replace(
              /\S+/,
              (word) => dictionary.get(key(word)) ?? word
            );
          }
          const known = dictionary.get(key(part));
          if (known) return cased(part, known);
          return part
            .split(separators)
            .map((word) => {
              const found = dictionary.get(key(word));
              return found && word.trim() ? cased(word, found) : word;
            })
            .join("");
        })
        .join("");
    })
    .join("");
}
