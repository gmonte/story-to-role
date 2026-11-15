import type { CareerLanguage } from "@repo/api/domains/career/schemas/career";

import type { TurnKind } from "./schemas/interview";

type BlockedKind = Extract<
  TurnKind,
  "off_topic" | "blocked_override" | "cooldown"
>;

/**
 * Replies written by code, never by a model (guided interview spec,
 * guardrails 3 and 8), in the interview language: they steer the user back
 * to the current question.
 */
const replies: Record<CareerLanguage, Record<BlockedKind, string>> = {
  "en-US": {
    off_topic:
      "I can only help with your career story here. Let's get back to the last question.",
    blocked_override:
      "I can't change how I work. Let's get back to your career story and the last question.",
    cooldown:
      "Let's take a short break. The interview will be available again in a few minutes.",
  },
  "pt-BR": {
    off_topic:
      "Aqui eu só posso ajudar com a sua história profissional. Vamos voltar à última pergunta.",
    blocked_override:
      "Não posso mudar a forma como trabalho. Vamos voltar à sua história profissional e à última pergunta.",
    cooldown:
      "Vamos fazer uma pausa curta. A entrevista volta a ficar disponível em alguns minutos.",
  },
};

export function fixedReply(kind: BlockedKind, language: CareerLanguage) {
  return replies[language][kind];
}
