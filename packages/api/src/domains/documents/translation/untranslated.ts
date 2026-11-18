import type { ProfileLanguage } from "@repo/api/domains/profile/truth/sections";
import { foldAccents } from "@repo/api/utils/text/fold-accents";

import { knownLanguageTerms } from "./language-terms";

/**
 * Words that give a language away in a code-printed field (an employer's
 * note, a degree, a city line): function words and the words of degrees,
 * statuses and places. A proper noun alone (“Globex”, “São Paulo”) names
 * no language, so it is never pointed out.
 */
const stoplists: Record<ProfileLanguage, string[]> = {
  "pt-BR": [
    "de",
    "da",
    "do",
    "das",
    "dos",
    "em",
    "e",
    "ou",
    "para",
    "com",
    "sem",
    "no",
    "na",
    "nos",
    "nas",
    "agora",
    "atual",
    "atualmente",
    "antiga",
    "antigo",
    "antes",
    "ex",
    "hoje",
    "grupo",
    "bacharelado",
    "bacharel",
    "licenciatura",
    "tecnólogo",
    "tecnologia",
    "técnico",
    "mestrado",
    "mestre",
    "doutorado",
    "doutor",
    "pós-graduação",
    "pós",
    "especialização",
    "mba",
    "graduação",
    "curso",
    "formação",
    "sistemas",
    "informação",
    "ciência",
    "ciências",
    "computação",
    "engenharia",
    "administração",
    "direito",
    "economia",
    "contabilidade",
    "universidade",
    "faculdade",
    "instituto",
    "federal",
    "estadual",
    "escola",
    "certificação",
    "certificado",
    "concluído",
    "concluída",
    "completo",
    "andamento",
    "válida",
    "válido",
    "expirada",
    "expirado",
    "renovação",
    "brasil",
    "estados",
    "unidos",
    "sênior",
    "pleno",
    "júnior",
    "líder",
    "gerente",
    "coordenador",
    "coordenadora",
    "analista",
    "desenvolvedor",
    "desenvolvedora",
    "engenheiro",
    "engenheira",
    "arquiteto",
    "arquiteta",
    "estagiário",
    "estagiária",
    "consultor",
    "consultora",
    "professor",
    "professora",
    "diretor",
    "diretora",
    "especialista",
  ],
  "en-US": [
    "of",
    "the",
    "in",
    "and",
    "or",
    "for",
    "with",
    "without",
    "at",
    "now",
    "formerly",
    "former",
    "currently",
    "today",
    "group",
    "bachelor",
    "bachelor's",
    "bachelors",
    "master",
    "master's",
    "masters",
    "phd",
    "doctorate",
    "postgraduate",
    "specialization",
    "mba",
    "degree",
    "course",
    "systems",
    "information",
    "science",
    "sciences",
    "computing",
    "computer",
    "engineering",
    "administration",
    "business",
    "law",
    "economics",
    "accounting",
    "university",
    "college",
    "institute",
    "federal",
    "state",
    "school",
    "certification",
    "certificate",
    "certified",
    "completed",
    "progress",
    "valid",
    "expired",
    "renewing",
    "brazil",
    "united",
    "states",
    "senior",
    "mid-level",
    "junior",
    "lead",
    "manager",
    "coordinator",
    "analyst",
    "developer",
    "engineer",
    "architect",
    "intern",
    "consultant",
    "teacher",
    "director",
    "specialist",
  ],
};

const wordSets: Record<ProfileLanguage, Set<string>> = {
  "pt-BR": new Set(
    [...stoplists["pt-BR"], ...knownLanguageTerms("pt-BR")].map(foldAccents)
  ),
  "en-US": new Set(
    [...stoplists["en-US"], ...knownLanguageTerms("en-US")].map(foldAccents)
  ),
};

const words = (text: string) =>
  foldAccents(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}'-]+/u)
    .filter(Boolean);

/**
 * Whether a code-printed field reads as written in `language` (resume spec,
 * "Document workspace": a field left in the profile's language in a
 * document of another): it holds a word of that language's stoplist or of
 * the built-in language dictionary. Text made only of proper nouns, codes
 * and figures is never pointed out, since nothing says what language it is.
 */
export function looksWrittenIn(text: string, language: ProfileLanguage) {
  const known = wordSets[language];
  const other = wordSets[language === "pt-BR" ? "en-US" : "pt-BR"];
  let hits = 0;
  for (const word of words(text)) {
    // A word of both languages (“federal”, “mba”) tells nothing.
    if (known.has(word) && !other.has(word)) hits++;
  }
  return hits > 0;
}
