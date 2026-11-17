import type { ProfileLanguage } from "../truth/sections";

export type FixedReplyKind =
  | "off_topic"
  | "blocked_override"
  | "cooldown"
  | "too_long"
  | "too_many"
  | "out_of_credits";

/**
 * Replies written by code, never by a model (AI platform spec, guardrails 2,
 * 3, 7 and 8), in the language of the user's message: they steer the user
 * back to their profile.
 */
const replies: Record<ProfileLanguage, Record<FixedReplyKind, string>> = {
  "en-US": {
    off_topic:
      "I can only help with your career profile here. Tell me about a position, or select a passage of the profile to talk about.",
    blocked_override:
      "I can't change how I work. Let's get back to your career profile.",
    cooldown:
      "Let's take a short break. I'll be available again in a few minutes.",
    too_long:
      "That message is too long for me to read at once. Send it in smaller parts, one position at a time.",
    too_many:
      "That's a lot of messages in a short time. Give me a moment and send it again.",
    out_of_credits:
      "You're out of credits for the agent right now. Subscribe for monthly credits or buy a pack, then come back to this message. The editor, its linter and Fix format stay free.",
  },
  "pt-BR": {
    off_topic:
      "Aqui eu só posso ajudar com o seu perfil profissional. Conte sobre um cargo, ou selecione um trecho do perfil para conversarmos.",
    blocked_override:
      "Não posso mudar a forma como trabalho. Vamos voltar ao seu perfil profissional.",
    cooldown:
      "Vamos fazer uma pausa curta. Volto a ficar disponível em alguns minutos.",
    too_long:
      "Essa mensagem é longa demais para eu ler de uma vez. Envie em partes menores, um cargo por vez.",
    too_many:
      "São muitas mensagens em pouco tempo. Me dê um instante e envie de novo.",
    out_of_credits:
      "Seus créditos para o agente acabaram por agora. Assine para ter créditos todo mês ou compre um pacote, e volte a esta mensagem. O editor, o linter e o Corrigir formato continuam gratuitos.",
  },
};

export function fixedReply(kind: FixedReplyKind, language: ProfileLanguage) {
  return replies[language][kind];
}
