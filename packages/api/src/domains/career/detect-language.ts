import type { InterviewLanguage } from "./schemas/career";

// Short words each language uses all the time and the other doesn't.
const markers: Record<InterviewLanguage, Set<string>> = {
  "en-US": new Set(
    "the and i my was were with for is are to of at this that have had did worked".split(
      " "
    )
  ),
  "pt-BR": new Set(
    "que não eu meu minha um uma com para é na os as por mais fiz era foi trabalhei sou tenho isso".split(
      " "
    )
  ),
};

/**
 * The supported language a chat message is written in, from its common
 * words and Portuguese accents, or null when it doesn't say (too short, or
 * as much of one as the other).
 */
export function detectLanguage(text: string): InterviewLanguage | null {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const score = (language: InterviewLanguage) =>
    words.filter((word) => markers[language].has(word)).length;
  const english = score("en-US");
  const portuguese = score("pt-BR") + (/[ãõçâêô]/i.test(text) ? 1 : 0);
  if (english === portuguese) return null;
  return english > portuguese ? "en-US" : "pt-BR";
}
